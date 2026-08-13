package policy

import (
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	dayWindow           = 24 * time.Hour
	weekWindow          = 7 * 24 * time.Hour
	usageFlushInterval  = 15 * time.Second
	reservationTTL      = 10 * time.Minute
	idempotencyTTL      = 24 * time.Hour
	maxRequestIDsPerKey = 4096
)

const microsPerUSD int64 = 1_000_000

func usdToMicros(usd float64) int64 {
	return int64(math.Round(usd * float64(microsPerUSD)))
}

func microsToUSD(micros int64) float64 {
	return float64(micros) / float64(microsPerUSD)
}

type usageReservation struct {
	amountMicros int64
	createdAt    time.Time
}

// usageLedger tracks per-key dollar usage with a daily window (UTC midnight
// reset), a rolling 7-day weekly window, and a lifetime total that only resets
// through an explicit management action. Usage is also broken down per alias.
//
// It is the in-memory source of truth; a background flusher periodically
// persists it to the state JSON (see Store.persistUsage). Reads for limit
// enforcement (Authenticate) and reporting (keys list) go through here.
type usageLedger struct {
	mu         sync.Mutex
	now        func() time.Time
	dirty      bool
	generation uint64
	// usage by key id; nil entry allowed when a key has no usage recorded yet.
	entries map[string]*UsageState
	// Reservations are runtime-only estimates held between authentication and
	// usage.handle settlement. They prevent concurrent requests from all seeing
	// the same remaining budget. Queues are keyed by key id + alias.
	reservations map[string][]usageReservation
}

func newUsageLedger(now func() time.Time) *usageLedger {
	if now == nil {
		now = time.Now
	}
	return &usageLedger{
		now:          now,
		entries:      make(map[string]*UsageState),
		reservations: make(map[string][]usageReservation),
	}
}

// loadFromState seeds the ledger from a loaded state file (restart recovery).
func (l *usageLedger) loadFromState(usage map[string]*UsageState) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = make(map[string]*UsageState, len(usage))
	l.reservations = make(map[string][]usageReservation)
	for id, st := range usage {
		if st == nil {
			continue
		}
		l.entries[id] = cloneUsageState(st)
	}
	// Rewrite loaded usage once. This persists any legacy JSON migrations
	// performed by UsageState.UnmarshalJSON (including micro-dollar fields and
	// the multi-window alias shape); subsequent clean intervals are skipped.
	l.dirty = len(l.entries) > 0
	if l.dirty {
		l.generation = 1
	} else {
		l.generation = 0
	}
}

// snapshot returns a deep copy for persistence/reporting.
func (l *usageLedger) snapshot() map[string]*UsageState {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make(map[string]*UsageState, len(l.entries))
	for id, st := range l.entries {
		if st == nil {
			continue
		}
		out[id] = cloneUsageState(st)
	}
	return out
}

func cloneUsageState(st *UsageState) *UsageState {
	if st == nil {
		return nil
	}
	cp := *st
	cp.ByAlias = make(map[string]AliasUsageWindows, len(st.ByAlias))
	for alias, usage := range st.ByAlias {
		cp.ByAlias[alias] = usage
	}
	cp.ProcessedRequests = make(map[string]time.Time, len(st.ProcessedRequests))
	for requestID, processedAt := range st.ProcessedRequests {
		cp.ProcessedRequests[requestID] = processedAt
	}
	return &cp
}

func (l *usageLedger) snapshotForFlush() (map[string]*UsageState, uint64, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.dirty {
		return nil, l.generation, false
	}
	out := make(map[string]*UsageState, len(l.entries))
	for id, st := range l.entries {
		if st != nil {
			out[id] = cloneUsageState(st)
		}
	}
	return out, l.generation, true
}

func (l *usageLedger) markPersisted(generation uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.generation == generation {
		l.dirty = false
	}
}

func (l *usageLedger) isDirty() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.dirty
}

func (l *usageLedger) markDirtyLocked() {
	l.dirty = true
	l.generation++
}

func (l *usageLedger) entryLocked(id string) *UsageState {
	st := l.entries[id]
	if st == nil {
		st = &UsageState{
			ByAlias:           make(map[string]AliasUsageWindows),
			ProcessedRequests: make(map[string]time.Time),
		}
		l.entries[id] = st
	}
	if st.ByAlias == nil {
		st.ByAlias = make(map[string]AliasUsageWindows)
	}
	if st.ProcessedRequests == nil {
		st.ProcessedRequests = make(map[string]time.Time)
	}
	return st
}

// ensureDailyWindow resets the daily window if we crossed UTC midnight since it
// last started. Caller must hold the mutex.
func (l *usageLedger) ensureDailyWindowLocked(st *UsageState, now time.Time) {
	startOfDay := now.UTC().Truncate(dayWindow)
	if st.Daily.WindowStart.IsZero() || !sameDay(st.Daily.WindowStart, startOfDay) {
		st.Daily = UsageWindow{WindowStart: startOfDay}
	}
}

func (l *usageLedger) ensureWeeklyWindowLocked(st *UsageState, now time.Time) {
	// Rolling window: if the recorded start is older than 7 days, slide it
	// forward so only the trailing 7 days count. We drop the accumulated total
	// and reset the window to now (conservative — losing usage that aged out
	// rather than recomputing partial slices; acceptable for an over-quota guard).
	if st.Weekly.WindowStart.IsZero() || now.Sub(st.Weekly.WindowStart) >= weekWindow {
		st.Weekly = UsageWindow{WindowStart: now.UTC()}
	}
}

func (l *usageLedger) ensureTotalWindowLocked(w *UsageWindow, now time.Time) {
	if w.WindowStart.IsZero() {
		w.WindowStart = now.UTC()
	}
}

// ensureAliasWindow applies the same window logic to a per-alias daily/weekly slice.
func (l *usageLedger) ensureAliasWindowLocked(w *UsageWindow, daily bool, now time.Time) {
	if daily {
		startOfDay := now.UTC().Truncate(dayWindow)
		if w.WindowStart.IsZero() || !sameDay(w.WindowStart, startOfDay) {
			*w = UsageWindow{WindowStart: startOfDay}
		}
		return
	}
	if w.WindowStart.IsZero() || now.Sub(w.WindowStart) >= weekWindow {
		*w = UsageWindow{WindowStart: now.UTC()}
	}
}

func sameDay(a, b time.Time) bool {
	a = a.UTC()
	b = b.UTC()
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

// RecordCost adds a dollar amount for a key+alias to the daily, weekly, and
// per-alias buckets, advancing windows as needed. It also accumulates the
// cache-specific counters (cache-read tokens, cache spend, non-cache input
// tokens) used for the cache hit-rate / spend report — these do NOT feed limit
// enforcement, only the Summary the UI reads.
//
// callCount is the number of successful requests to add to CallCount for this
// record (1 for a normal request, 0 when billing a zero-cost/no-op record).
//
// amount is the total dollar bill for the record; cacheCost is the portion of
// that bill attributable to cache-hit input tokens priced at the cache price
// (0 when no cache price was configured); cacheReadTokens is the cache-hit
// count for the record; inputTokens is the non-cache input-token count charged
// at the regular input price (the denominator partner for hit-rate);
// outputTokens is the completion-token count charged at the output price.
func (l *usageLedger) RecordCost(id, alias string, amount, cacheCost float64, cacheReadTokens, inputTokens, outputTokens int64, callCount int64) {
	l.RecordCostMicros(id, "", alias, usdToMicros(amount), usdToMicros(cacheCost), cacheReadTokens, inputTokens, outputTokens, callCount, false)
}

// RecordCostMicros settles one pending reservation and records a completed
// request using integer micro-dollars. When requestID is non-empty, duplicate
// deliveries are ignored. failed releases the reservation and records the id,
// but does not add cost or counters.
func (l *usageLedger) RecordCostMicros(id, requestID, alias string, amountMicros, cacheCostMicros int64, cacheReadTokens, inputTokens, outputTokens int64, callCount int64, failed bool) bool {
	if id == "" {
		return false
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	st := l.entryLocked(id)
	requestID = strings.TrimSpace(requestID)
	if requestID != "" {
		l.pruneProcessedRequestsLocked(st, now)
		if _, duplicate := st.ProcessedRequests[requestID]; duplicate {
			return false
		}
		st.ProcessedRequests[requestID] = now.UTC()
	}
	l.releaseReservationLocked(id, alias, now)
	if failed {
		if requestID != "" {
			l.markDirtyLocked()
		}
		return true
	}
	if amountMicros == 0 && cacheCostMicros == 0 && cacheReadTokens == 0 && inputTokens == 0 && outputTokens == 0 && callCount == 0 {
		// Reservation-only settlement. Persist only when an idempotency id was
		// added; otherwise there is no durable usage change to flush.
		if requestID != "" {
			l.markDirtyLocked()
		}
		return true
	}
	l.ensureDailyWindowLocked(st, now)
	l.ensureWeeklyWindowLocked(st, now)
	l.ensureTotalWindowLocked(&st.Total, now)
	addMoney(&st.Daily, amountMicros, cacheCostMicros)
	addMoney(&st.Weekly, amountMicros, cacheCostMicros)
	addMoney(&st.Total, amountMicros, cacheCostMicros)
	st.Daily.CallCount += callCount
	st.Weekly.CallCount += callCount
	st.Total.CallCount += callCount
	if cacheReadTokens > 0 {
		st.Daily.CacheReadTokens += cacheReadTokens
		st.Weekly.CacheReadTokens += cacheReadTokens
		st.Total.CacheReadTokens += cacheReadTokens
	}
	if inputTokens > 0 {
		st.Daily.InputTokens += inputTokens
		st.Weekly.InputTokens += inputTokens
		st.Total.InputTokens += inputTokens
	}
	if outputTokens > 0 {
		st.Daily.OutputTokens += outputTokens
		st.Weekly.OutputTokens += outputTokens
		st.Total.OutputTokens += outputTokens
	}

	aliasEntry := st.ByAlias[alias]
	l.ensureAliasWindowLocked(&aliasEntry.Daily, true, now)
	l.ensureAliasWindowLocked(&aliasEntry.Weekly, false, now)
	l.ensureTotalWindowLocked(&aliasEntry.Total, now)
	addMoney(&aliasEntry.Daily, amountMicros, cacheCostMicros)
	addMoney(&aliasEntry.Weekly, amountMicros, cacheCostMicros)
	addMoney(&aliasEntry.Total, amountMicros, cacheCostMicros)
	aliasEntry.Daily.CallCount += callCount
	aliasEntry.Weekly.CallCount += callCount
	aliasEntry.Total.CallCount += callCount
	aliasEntry.Daily.CacheReadTokens += cacheReadTokens
	aliasEntry.Weekly.CacheReadTokens += cacheReadTokens
	aliasEntry.Total.CacheReadTokens += cacheReadTokens
	aliasEntry.Daily.InputTokens += inputTokens
	aliasEntry.Weekly.InputTokens += inputTokens
	aliasEntry.Total.InputTokens += inputTokens
	aliasEntry.Daily.OutputTokens += outputTokens
	aliasEntry.Weekly.OutputTokens += outputTokens
	aliasEntry.Total.OutputTokens += outputTokens
	st.ByAlias[alias] = aliasEntry
	l.markDirtyLocked()
	return true
}

func addMoney(w *UsageWindow, amountMicros, cacheCostMicros int64) {
	w.normalizeMoney()
	w.TotalMicros += amountMicros
	w.CacheCostMicros += cacheCostMicros
	w.TotalUSD = microsToUSD(w.TotalMicros)
	w.CacheCostUSD = microsToUSD(w.CacheCostMicros)
}

func reservationKey(id, alias string) string {
	return strings.ToLower(strings.TrimSpace(id)) + "\x00" + strings.ToLower(strings.TrimSpace(alias))
}

func (l *usageLedger) pruneReservationsLocked(now time.Time) {
	for key, queue := range l.reservations {
		kept := queue[:0]
		for _, reservation := range queue {
			if now.Sub(reservation.createdAt) < reservationTTL && !now.Before(reservation.createdAt) {
				kept = append(kept, reservation)
			}
		}
		if len(kept) == 0 {
			delete(l.reservations, key)
		} else {
			l.reservations[key] = kept
		}
	}
}

func (l *usageLedger) releaseReservationLocked(id, alias string, now time.Time) {
	l.pruneReservationsLocked(now)
	key := reservationKey(id, alias)
	queue := l.reservations[key]
	if len(queue) == 0 {
		return
	}
	if len(queue) == 1 {
		delete(l.reservations, key)
		return
	}
	// usage.handle completions can arrive out of order and currently do not
	// carry the authentication reservation id. Release the smallest estimate;
	// retaining larger reservations is conservative and avoids temporarily
	// under-reserving the key when a cheap request finishes before an expensive
	// one. Any harmless over-reservation disappears as the remaining requests
	// settle or reach reservationTTL.
	smallest := 0
	for i := 1; i < len(queue); i++ {
		if queue[i].amountMicros < queue[smallest].amountMicros {
			smallest = i
		}
	}
	queue = append(queue[:smallest], queue[smallest+1:]...)
	l.reservations[key] = queue
}

func (l *usageLedger) reservedMicrosLocked(id string) int64 {
	prefix := strings.ToLower(strings.TrimSpace(id)) + "\x00"
	var total int64
	for key, queue := range l.reservations {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		for _, reservation := range queue {
			total += reservation.amountMicros
		}
	}
	return total
}

// Reserve checks actual usage plus all in-flight estimates atomically, then
// appends a reservation for the request. A zero estimate still performs the
// at-limit check but does not create a queue entry.
func (l *usageLedger) Reserve(key KeyConfig, alias string, amountMicros int64) string {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneReservationsLocked(now)
	st := l.entryLocked(key.ID)
	l.ensureDailyWindowLocked(st, now)
	l.ensureWeeklyWindowLocked(st, now)
	reserved := l.reservedMicrosLocked(key.ID)
	checks := []struct {
		limit  float64
		used   int64
		reason string
	}{
		{key.DailyLimitUSD, st.Daily.TotalMicros, "daily_exceeded"},
		{key.WeeklyLimitUSD, st.Weekly.TotalMicros, "weekly_exceeded"},
		{key.TotalLimitUSD, st.Total.TotalMicros, "total_exceeded"},
	}
	for _, check := range checks {
		if check.limit <= 0 {
			continue
		}
		limitMicros := usdToMicros(check.limit)
		if check.used+reserved >= limitMicros || check.used+reserved+amountMicros > limitMicros {
			return check.reason
		}
	}
	if amountMicros > 0 {
		reservation := usageReservation{amountMicros: amountMicros, createdAt: now}
		queueKey := reservationKey(key.ID, alias)
		l.reservations[queueKey] = append(l.reservations[queueKey], reservation)
	}
	return ""
}

func (l *usageLedger) pruneProcessedRequestsLocked(st *UsageState, now time.Time) {
	cutoff := now.Add(-idempotencyTTL)
	for requestID, processedAt := range st.ProcessedRequests {
		if processedAt.Before(cutoff) || now.Before(processedAt) {
			delete(st.ProcessedRequests, requestID)
		}
	}
	if len(st.ProcessedRequests) < maxRequestIDsPerKey {
		return
	}
	type processedRequest struct {
		id string
		at time.Time
	}
	items := make([]processedRequest, 0, len(st.ProcessedRequests))
	for id, at := range st.ProcessedRequests {
		items = append(items, processedRequest{id: id, at: at})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].at.Before(items[j].at) })
	for i := 0; i <= len(items)-maxRequestIDsPerKey; i++ {
		delete(st.ProcessedRequests, items[i].id)
	}
}

// UsageSummary is what the keys-list API reports for a key. Daily and weekly
// windows reset automatically; TotalUSD is lifetime usage until an explicit
// administrator reset.
type UsageSummary struct {
	DailyUSD              float64   `json:"daily_usd"`
	WeeklyUSD             float64   `json:"weekly_usd"`
	TotalUSD              float64   `json:"total_usd"`
	DailyLimitUSD         float64   `json:"daily_limit_usd"`
	WeeklyLimitUSD        float64   `json:"weekly_limit_usd"`
	TotalLimitUSD         float64   `json:"total_limit_usd"`
	DailyResetAt          time.Time `json:"daily_reset_at,omitempty"`
	WeeklyResetAt         time.Time `json:"weekly_reset_at,omitempty"`
	DailyCacheCostUSD     float64   `json:"daily_cache_cost_usd,omitempty"`
	WeeklyCacheCostUSD    float64   `json:"weekly_cache_cost_usd,omitempty"`
	DailyCacheReadTokens  int64     `json:"daily_cache_read_tokens,omitempty"`
	WeeklyCacheReadTokens int64     `json:"weekly_cache_read_tokens,omitempty"`
	DailyInputTokens      int64     `json:"daily_input_tokens,omitempty"`
	WeeklyInputTokens     int64     `json:"weekly_input_tokens,omitempty"`
	// DailyCallCount / WeeklyCallCount: number of successful requests billed
	// into the window (token-billed or per-call). Failed requests don't count.
	// Reported for display only; not used for limit enforcement.
	DailyCallCount  int64 `json:"daily_call_count,omitempty"`
	WeeklyCallCount int64 `json:"weekly_call_count,omitempty"`
	TotalCallCount  int64 `json:"total_call_count,omitempty"`
}

// Summary returns the current usage + limits for a key. Limits come from the
// KeyConfig; usage from the ledger. daily_reset_at = next UTC midnight;
// weekly_reset_at = window start + 7 days; lifetime total has no reset time.
func (l *usageLedger) Summary(key KeyConfig) UsageSummary {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	st := l.entries[key.ID]
	summary := UsageSummary{
		DailyLimitUSD:  key.DailyLimitUSD,
		WeeklyLimitUSD: key.WeeklyLimitUSD,
		TotalLimitUSD:  key.TotalLimitUSD,
		DailyResetAt:   now.UTC().Truncate(dayWindow).Add(dayWindow),
	}
	if st == nil {
		return summary
	}
	// Re-evaluate windows on read so a report never shows stale totals from a
	// window that already aged out.
	ensureSt := *st
	if ensureSt.ByAlias == nil {
		ensureSt.ByAlias = make(map[string]AliasUsageWindows)
	}
	l.ensureDailyWindowLocked(&ensureSt, now)
	l.ensureWeeklyWindowLocked(&ensureSt, now)
	summary.DailyUSD = microsToUSD(ensureSt.Daily.TotalMicros)
	summary.WeeklyUSD = microsToUSD(ensureSt.Weekly.TotalMicros)
	summary.TotalUSD = microsToUSD(ensureSt.Total.TotalMicros)
	summary.DailyCacheCostUSD = microsToUSD(ensureSt.Daily.CacheCostMicros)
	summary.WeeklyCacheCostUSD = microsToUSD(ensureSt.Weekly.CacheCostMicros)
	summary.DailyCacheReadTokens = ensureSt.Daily.CacheReadTokens
	summary.WeeklyCacheReadTokens = ensureSt.Weekly.CacheReadTokens
	summary.DailyInputTokens = ensureSt.Daily.InputTokens
	summary.WeeklyInputTokens = ensureSt.Weekly.InputTokens
	summary.DailyCallCount = ensureSt.Daily.CallCount
	summary.WeeklyCallCount = ensureSt.Weekly.CallCount
	summary.TotalCallCount = ensureSt.Total.CallCount
	if !ensureSt.Weekly.WindowStart.IsZero() {
		summary.WeeklyResetAt = ensureSt.Weekly.WindowStart.Add(weekWindow)
	}
	return summary
}

// OverLimit reports whether a key is over its daily, weekly, or lifetime total
// dollar limit.
func (l *usageLedger) OverLimit(key KeyConfig) (string, UsageSummary) {
	if key.DailyLimitUSD <= 0 && key.WeeklyLimitUSD <= 0 && key.TotalLimitUSD <= 0 {
		return "", UsageSummary{}
	}
	s := l.Summary(key)
	if key.DailyLimitUSD > 0 && usdToMicros(s.DailyUSD) >= usdToMicros(key.DailyLimitUSD) {
		return "daily_exceeded", s
	}
	if key.WeeklyLimitUSD > 0 && usdToMicros(s.WeeklyUSD) >= usdToMicros(key.WeeklyLimitUSD) {
		return "weekly_exceeded", s
	}
	if key.TotalLimitUSD > 0 && usdToMicros(s.TotalUSD) >= usdToMicros(key.TotalLimitUSD) {
		return "total_exceeded", s
	}
	return "", UsageSummary{}
}

// resetUsage clears usage for a key (manual unlock) in memory only.
func (l *usageLedger) resetUsage(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, id)
	prefix := strings.ToLower(strings.TrimSpace(id)) + "\x00"
	for key := range l.reservations {
		if strings.HasPrefix(key, prefix) {
			delete(l.reservations, key)
		}
	}
	l.markDirtyLocked()
}

// AliasUsageEntry is one row of the per-alias usage breakdown reported by the
// key detail API. Configured aliases appear with InConfig=true (zero values
// when unused); aliases with historical usage that are no longer in the key's
// config appear with InConfig=false. Daily/Weekly are the current (re-evaluated)
// daily/weekly windows and lifetime total for that alias.
type AliasUsageEntry struct {
	Alias       string      `json:"alias"`
	Provider    string      `json:"provider,omitempty"`
	TargetModel string      `json:"target_model,omitempty"`
	BillingMode string      `json:"billing_mode,omitempty"`
	PerCallUSD  float64     `json:"per_call_usd,omitempty"`
	InConfig    bool        `json:"in_config"`
	Daily       UsageWindow `json:"daily"`
	Weekly      UsageWindow `json:"weekly"`
	Total       UsageWindow `json:"total"`
}

// AliasUsage returns a per-alias usage breakdown for a key: configured aliases
// (zero values when unused) merged with ledger residuals (aliases that have
// historical usage but are no longer in the key's config, InConfig=false).
// Windows are re-evaluated on read so an aged-out weekly total resets for
// display (the read does not mutate the ledger; the next write commits the
// reset, mirroring Summary). Rows are sorted by alias for stable display.
func (l *usageLedger) AliasUsage(key KeyConfig) []AliasUsageEntry {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	byAlias := make(map[string]AliasUsageEntry, len(key.Models))
	for _, rule := range key.Models {
		byAlias[rule.Alias] = AliasUsageEntry{
			Alias:       rule.Alias,
			Provider:    rule.Provider,
			TargetModel: rule.TargetModel,
			BillingMode: rule.BillingMode,
			PerCallUSD:  rule.PerCallUSD,
			InConfig:    true,
		}
	}

	if st := l.entries[key.ID]; st != nil {
		for alias, w := range st.ByAlias {
			// Re-evaluate windows on a local copy so a stale weekly total resets
			// for display without mutating the ledger.
			l.ensureAliasWindowLocked(&w.Daily, true, now)
			l.ensureAliasWindowLocked(&w.Weekly, false, now)
			entry, ok := byAlias[alias]
			if !ok {
				entry = AliasUsageEntry{Alias: alias, InConfig: false}
			}
			entry.Daily = w.Daily
			entry.Weekly = w.Weekly
			entry.Total = w.Total
			byAlias[alias] = entry
		}
	}

	out := make([]AliasUsageEntry, 0, len(byAlias))
	for _, entry := range byAlias {
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Alias < out[j].Alias })
	return out
}
