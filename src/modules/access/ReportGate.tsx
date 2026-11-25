import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { myAccessQuery } from "./api";
import { firstAllowedPath, isAreaOn } from "./areas";

/** Relatório anual fora do menu: só abre se a área report estiver ligada. */
export default function ReportGate({ children }: { children: ReactNode }) {
  const { data: access, isLoading } = useQuery(myAccessQuery);
  if (isLoading) return null;
  return isAreaOn(access, "report") ? <>{children}</> : <Navigate to={firstAllowedPath(access)} replace />;
}
