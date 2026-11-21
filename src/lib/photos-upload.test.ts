import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ sign: vi.fn(), register: vi.fn() }));
vi.mock("./photo.functions", () => ({
  photoUploadServerFn: mock.sign,
  registerPhotoServerFn: mock.register,
  deletePhotoServerFn: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test" } }, error: null }),
    },
  },
}));
import { publicAuditPhotoUrls, uploadQuestionPhotos } from "./photos";

afterEach(() => vi.unstubAllGlobals());

it("opens an audit image by its public link without a session or signing request", () => {
  const path = "audit/question/evidence #1.jpg";
  const remote = "https://legacy.example.test/image.jpg";
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  expect(publicAuditPhotoUrls([path, remote], "https://bucket.example.test/")).toEqual({
    [path]: "https://bucket.example.test/audit/question/evidence%20%231.jpg",
    [remote]: remote,
  });
  expect(request).not.toHaveBeenCalled();
  expect(mock.sign).not.toHaveBeenCalled();
});

it("returns successful attachments before and after an individual failed upload", async () => {
  mock.sign
    .mockResolvedValueOnce({ url: "https://uploads.test/first", path: "first" })
    .mockResolvedValueOnce({ url: "https://uploads.test/broken", path: "broken" })
    .mockResolvedValueOnce({ url: "https://uploads.test/last", path: "last" });
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(null, {
        status: url.endsWith("broken") ? 503 : 200,
      }),
  );
  mock.register.mockResolvedValue({});
  // Use opaque file bytes to exercise the batch without a DOM image decoder.
  const files = ["first.jpg", "broken.jpg", "last.jpg"].map(
    (name) => new File(["test"], name, { type: "application/octet-stream" }),
  );
  await expect(uploadQuestionPhotos("audit", "question", files)).resolves.toEqual({
    uploaded: 2,
    failed: ["broken.jpg"],
  });
  expect(mock.register.mock.calls.map(([request]) => request.data.path)).toEqual(["first", "last"]);
});
