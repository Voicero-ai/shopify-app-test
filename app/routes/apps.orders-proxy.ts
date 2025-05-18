// app/routes/apps/orders-proxy.ts
import { json } from "@remix-run/node";
import { type LoaderFunctionArgs } from "@remix-run/node";

export const dynamic = "force-dynamic";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) {
    return json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Fetch last-60-days orders
  const resp = await fetch(
    `https://${shop}/admin/api/2025-01/orders.json?limit=50`,
    {
      headers: { "X-Shopify-Access-Token": token },
    },
  );

  if (!resp.ok) {
    return json(
      { error: `Shopify API error: ${resp.statusText}` },
      { status: resp.status },
    );
  }

  const orders = await resp.json();
  return json(orders);
}
