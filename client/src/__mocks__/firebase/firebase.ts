import { vi } from "vitest";

export const mockAuth = {
  currentUser: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

export const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
};
