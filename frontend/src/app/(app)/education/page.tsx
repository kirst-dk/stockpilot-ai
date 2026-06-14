"use client";

import { EducationTab, useAppData } from "@/components/AppCore";

export default function EducationPage() {
  const d = useAppData();
  return (
    <EducationTab
      nansenData={d.nansenData}
      nansenLoading={d.nansenLoading}
      elfaData={d.elfaData}
      elfaLoading={d.elfaLoading}
    />
  );
}
