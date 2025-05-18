import { ActionFunction, LoaderFunction } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { Page } from "@shopify/polaris";

export const dynamic = "force-dynamic";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("--------hit app proxy loader--------");

  const session = await authenticate.public.appProxy(request);
  if (session) {
    console.log("session from loader", session);
  }

  return null;
};

export const action: ActionFunction = async ({ request }) => {
  console.log("--------hit app proxy--------");

  const session = await authenticate.public.appProxy(request);
  if (session) {
    console.log("session", session);
  }

  return null;
};
