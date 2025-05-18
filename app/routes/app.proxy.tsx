import { ActionFunction } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { Page } from "@shopify/polaris";


export const action: ActionFunction = async ({ request }) => {
    console.log("--------hit app proxy--------")

    const session = await authenticate.public.appProxy(request);
    if(session) {
        console.log("session", session)
    }

    return null;
}