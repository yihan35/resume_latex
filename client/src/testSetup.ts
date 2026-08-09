import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({
    destroy: vi.fn(),
    promise: new Promise(() => undefined),
  })),
  GlobalWorkerOptions: {},
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "pdf.worker.test.mjs",
}));
