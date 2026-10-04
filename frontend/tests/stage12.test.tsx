import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const signOut = vi.fn();
const success = vi.fn();
const error = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ signOut: () => signOut() }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: (m: string) => success(m), error: (m: string) => error(m) } }));

import { useSignOut } from "@/lib/hooks/use-sign-out";

beforeEach(() => {
  push.mockReset();
  signOut.mockReset();
  success.mockReset();
  error.mockReset();
});

describe("useSignOut (header menu and Settings share it)", () => {
  it("ends the session on the server before leaving", async () => {
    const order: string[] = [];
    signOut.mockImplementation(async () => order.push("api"));
    push.mockImplementation(() => order.push("navigate"));
    const { result } = renderHook(() => useSignOut());
    await act(() => result.current());
    expect(order).toEqual(["api", "navigate"]);
    expect(push).toHaveBeenCalledWith("/");
    expect(success).toHaveBeenCalledWith("Signed out");
  });

  it("stays put and says so when the server can't sign out", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSignOut());
    await act(() => result.current());
    expect(push).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Couldn't sign you out. Please try again.");
  });
});
