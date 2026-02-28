import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { NotFoundPageView } from "@/pages/not-found/NotFoundPageView";

export function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return <NotFoundPageView />;
}
