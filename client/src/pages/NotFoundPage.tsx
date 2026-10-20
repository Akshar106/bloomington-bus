import { Link } from "react-router";

export function NotFoundPage({ what = "page" }: { what?: string }) {
  return (
    <div>
      <h1>We couldn't find that {what}</h1>
      <p className="muted">
        It may have been removed from Bloomington Transit's schedule. <Link to="/">Search for a stop</Link>.
      </p>
    </div>
  );
}
