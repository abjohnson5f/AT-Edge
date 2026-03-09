import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Toaster } from "@/src/components/ui/toaster";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export function AppLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "s":
          navigate("/scout");
          break;
        case "i":
          navigate("/import");
          break;
        case "p":
          navigate("/portfolio");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-50 dark">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
