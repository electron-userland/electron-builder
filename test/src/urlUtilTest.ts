import { utils } from "electron-updater/internal"
import { URL } from "url"

test("newUrlFromBase", ({ expect }) => {
  const fileUrl = new URL("https://AWS_S3_HOST/bucket-yashraj/electron%20Setup%2011.0.3.exe")
  const newBlockMapUrl = utils.newUrlFromBase(`${fileUrl.pathname}.blockmap`, fileUrl)
  expect(newBlockMapUrl.href).toBe("https://aws_s3_host/bucket-yashraj/electron%20Setup%2011.0.3.exe.blockmap")
})

test("add no cache", ({ expect }) => {
  const baseUrl = new URL("https://gitlab.com/artifacts/master/raw/dist?job=build_electron_win")
  const newBlockMapUrl = utils.newUrlFromBase("latest.yml", baseUrl, true)
  expect(newBlockMapUrl.href).toBe("https://gitlab.com/artifacts/master/raw/latest.yml?job=build_electron_win")
})

describe("newUrlFromBase — the base query stays on the base origin", () => {
  const feedUrl = new URL("https://feed.example.com/updates/?token=secret")

  test("same-origin URLs still get the feed query", ({ expect }) => {
    expect(utils.newUrlFromBase("app.exe", feedUrl).href).toBe("https://feed.example.com/updates/app.exe?token=secret")
    expect(utils.newUrlFromBase("https://feed.example.com/other/app.exe", feedUrl).href).toBe("https://feed.example.com/other/app.exe?token=secret")
  })

  test("does not copy the feed query to another origin", ({ expect }) => {
    expect(utils.newUrlFromBase("https://cdn.example.net/app.exe", feedUrl).href).toBe("https://cdn.example.net/app.exe")
  })

  test("a URL on another origin keeps its own query", ({ expect }) => {
    expect(utils.newUrlFromBase("https://cdn.example.net/app.exe?X-Amz-Signature=abc", feedUrl).href).toBe("https://cdn.example.net/app.exe?X-Amz-Signature=abc")
  })

  test("another port is another origin", ({ expect }) => {
    expect(utils.newUrlFromBase("http://127.0.0.1:2222/x", new URL("http://127.0.0.1:1111/?t=1")).href).toBe("http://127.0.0.1:2222/x")
  })

  test("https → http on the same host is another origin", ({ expect }) => {
    expect(utils.newUrlFromBase("http://feed.example.com/updates/app.exe", feedUrl).href).toBe("http://feed.example.com/updates/app.exe")
  })

  test("a blockmap path that resolves to another origin does not get the file's query", ({ expect }) => {
    // `..//host/…` in the update manifest yields a same-origin file URL whose pathname starts with `//`
    const fileUrl = utils.newUrlFromBase("..//cdn.example.net/app.exe", feedUrl)
    expect(fileUrl.href).toBe("https://feed.example.com//cdn.example.net/app.exe?token=secret")
    expect(utils.newUrlFromBase(`${fileUrl.pathname}.blockmap`, fileUrl).href).toBe("https://cdn.example.net/app.exe.blockmap")
  })
})
