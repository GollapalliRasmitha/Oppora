import type { Metadata } from "next";
import { DigestView } from "./digest-view";

export const metadata: Metadata = { title: "Weekly digest" };

export default function DigestPage() {
  return <DigestView />;
}
