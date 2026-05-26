import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export default function AuthBootstrap({ children }: PropsWithChildren) {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return <>{children}</>;
}
