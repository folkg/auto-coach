import { vi } from "vitest";

export const mockAuth = {
  currentUser: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
};
