import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);

  // Add Content Security Policy header
  const shopifycdn = "https://cdn.shopify.com";
  const voiceroApi = "http://localhost:3000";
  const trainingApi = "http://localhost:4000";
  responseHeaders.set(
    "Content-Security-Policy",
    `default-src 'self' ${shopifycdn} 'unsafe-eval' 'unsafe-inline'; connect-src 'self' ${shopifycdn} ${voiceroApi} ${trainingApi}; font-src 'self' ${shopifycdn} data:; style-src 'self' ${shopifycdn} 'unsafe-inline'; img-src 'self' ${shopifycdn} data: https:; script-src 'self' ${shopifycdn} 'unsafe-eval' 'unsafe-inline'`,
  );

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
