import { httpExecutor } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { BitbucketPublisher, PublishContext } from "electron-publish"
import { vi } from "vitest"

test("encodes artifact filenames when deleting releases", async ({ expect }) => {
  const publishContext: PublishContext = {
    cancellationToken: new CancellationToken(),
    progress: null,
  }
  const publisher = new BitbucketPublisher(publishContext, {
    provider: "bitbucket",
    owner: "test-owner",
    slug: "test-repo",
    token: "access-token-123",
  })
  const request = vi.spyOn(httpExecutor, "request").mockResolvedValue(null)

  try {
    await publisher.deleteRelease("My App #1.zip")
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/2.0/repositories/test-owner/test-repo/downloads/My%20App%20%231.zip" }),
      publishContext.cancellationToken
    )
  } finally {
    request.mockRestore()
  }
})
