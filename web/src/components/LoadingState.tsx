type LoadingVariant = "page" | "list" | "compact";

interface LoadingStateProps {
  label: string;
  variant?: LoadingVariant;
  rows?: number;
  className?: string;
}

export default function LoadingState(props: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center min-h-50">
      <div className="loader">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <title>{props.label}</title>
          <defs>
            <mask id="clipping">
              <polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon>
              <polygon points="25,25 75,25 50,75" fill="white"></polygon>
              <polygon points="50,25 75,75 25,75" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            </mask>
          </defs>
        </svg>
        <div className="box"></div>
      </div>
    </div>
  );
}
