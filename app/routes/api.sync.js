import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

// Pick the Admin API version you want for the REST calls:
const SHOPIFY_API_VERSION = "2025-01";

export const loader = async ({ request }) => {
  // We assume authenticate.admin returns { admin, session }
  // where:
  //    admin   -> your GraphQL client
  //    session -> has .shop and .accessToken from OAuth
  const { admin, session } = await authenticate.admin(request);

  try {
    console.log("Starting sync process...");

    // ---------------------
    // 1) Basic shop info
    // ---------------------
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
          name
          email
          primaryDomain { url }
          currencyCode
          timezoneAbbreviation
        }
      }
    `);
    const shopData = await shopResponse.json();
    if (!shopData?.data?.shop) {
      throw new Error("Shop data is missing or permissions are not granted.");
    }

    // ---------------------
    // 2) Products (GraphQL for IDs, relationships)
    // ---------------------
    const productsResponse = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              images(first: 10) {
                edges {
                  node {
                    id
                    originalSrc
                    altText
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
              collections(first: 10) {
                edges {
                  node {
                    id
                    title
                    handle
                    description
                    image {
                      url
                      altText
                    }
                    ruleSet {
                      rules {
                        column
                        condition
                        relation
                      }
                    }
                    sortOrder
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `);
    const productsData = await productsResponse.json();

    // For untruncated HTML, fetch each product with REST + fetch
    const extractNumericId = (gid) => gid.split("/").pop();

    // Helper to do a direct REST call
    const restGet = async (endpoint) => {
      const url = `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
      });
      if (!resp.ok) {
        throw new Error(`REST call failed: ${resp.status} ${resp.statusText}`);
      }
      return resp.json();
    };

    const mergedProducts = await Promise.all(
      productsData.data.products.edges.map(async ({ node }) => {
        const numericId = extractNumericId(node.id);

        // GET /products/{productId}.json
        const productRes = await restGet(`/products/${numericId}.json`);
        // shape: { product: {...} }
        const fullProd = productRes.product;

        return {
          shopifyId: parseInt(numericId),
          title: fullProd.title,
          handle: fullProd.handle,
          vendor: fullProd.vendor,
          productType: fullProd.product_type,
          // full body_html from REST
          description: fullProd.body_html,
          bodyHtml: fullProd.body_html,
          images: (fullProd.images || []).map((img) => ({
            shopifyId: img.id,
            url: img.src,
            altText: img.alt,
          })),
          variants: (fullProd.variants || []).map((v) => ({
            shopifyId: v.id,
            title: v.title,
            price: parseFloat(v.price),
            sku: v.sku,
            inventory: v.inventory_quantity,
          })),
          // Collections from the GraphQL node
          collections: node.collections.edges.map(({ node: coll }) => ({
            shopifyId: parseInt(extractNumericId(coll.id)),
            title: coll.title,
            handle: coll.handle,
            description: coll.description,
            image: coll.image
              ? {
                  url: coll.image.url,
                  altText: coll.image.altText,
                }
              : null,
            ruleSet: coll.ruleSet
              ? {
                  rules: coll.ruleSet.rules.map((rule) => ({
                    column: rule.column,
                    condition: rule.condition,
                    relation: rule.relation,
                  })),
                }
              : null,
            sortOrder: coll.sortOrder,
            updatedAt: coll.updatedAt,
          })),
        };
      }),
    );

    // ---------------------
    // 3) Pages (GraphQL for IDs)
    // ---------------------
    const pagesResponse = await admin.graphql(`
      {
        pages(first: 50) {
          edges {
            node {
              id
              title
              handle
              body
            }
          }
        }
      }
    `);
    const pagesData = await pagesResponse.json();

    // For untruncated HTML, fetch each page with REST
    const mergedPages = await Promise.all(
      pagesData.data.pages.edges.map(async ({ node }) => {
        const numericId = extractNumericId(node.id);

        // GET /pages/{pageId}.json
        const pageRes = await restGet(`/pages/${numericId}.json`);
        // shape: { page: {...} }
        const fullPage = pageRes.page;

        return {
          shopifyId: parseInt(numericId),
          title: fullPage.title,
          handle: fullPage.handle,
          // untruncated
          content: fullPage.body_html,
        };
      }),
    );

    // ---------------------
    // 4) Blogs + Articles (GraphQL for IDs)
    // ---------------------
    const blogsResponse = await admin.graphql(`
      {
        blogs(first: 10) {
          edges {
            node {
              id
              title
              handle
              articles(first: 20) {
                edges {
                  node {
                    id
                    title
                    handle
                    body
                    author {
                      name
                    }
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    const blogsData = await blogsResponse.json();

    // For untruncated articles
    const mergedBlogs = await Promise.all(
      blogsData.data.blogs.edges.map(async ({ node: blog }) => {
        const blogNumericId = extractNumericId(blog.id);

        const mergedArticles = await Promise.all(
          blog.articles.edges.map(async ({ node: article }) => {
            const articleNumericId = extractNumericId(article.id);

            // GET /blogs/{blogId}/articles/{articleId}.json
            const articleRes = await restGet(
              `/blogs/${blogNumericId}/articles/${articleNumericId}.json`,
            );
            // shape: { article: {...} }
            const fullArticle = articleRes.article;

            return {
              shopifyId: parseInt(articleNumericId),
              title: fullArticle.title,
              handle: fullArticle.handle,
              content: fullArticle.body_html, // untruncated
              author: fullArticle.author,
              image: fullArticle.image?.src || null,
            };
          }),
        );

        return {
          shopifyId: parseInt(blogNumericId),
          title: blog.title,
          handle: blog.handle,
          posts: mergedArticles,
        };
      }),
    );

    // ---------------------
    // 5) Collections (GraphQL only)
    // ---------------------
    const collectionsResponse = await admin.graphql(`
      {
        collections(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              image {
                url
                altText
              }
              products(first: 50) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
              ruleSet {
                rules {
                  column
                  condition
                  relation
                }
              }
              sortOrder
              updatedAt
            }
          }
        }
      }
    `);
    const collectionsData = await collectionsResponse.json();

    const formattedCollections = collectionsData.data.collections.edges.map(
      ({ node }) => ({
        shopifyId: parseInt(extractNumericId(node.id)),
        title: node.title,
        handle: node.handle,
        description: node.description,
        image: node.image
          ? {
              url: node.image.url,
              altText: node.image.altText,
            }
          : null,
        products: node.products.edges.map(({ node: product }) => ({
          shopifyId: parseInt(extractNumericId(product.id)),
          title: product.title,
          handle: product.handle,
        })),
        ruleSet: node.ruleSet
          ? {
              rules: node.ruleSet.rules.map((rule) => ({
                column: rule.column,
                condition: rule.condition,
                relation: rule.relation,
              })),
            }
          : null,
        sortOrder: node.sortOrder,
        updatedAt: node.updatedAt,
      }),
    );

    // ---------------------
    // 6) Discounts (GraphQL only)
    // ---------------------
    const discountsResponse = await admin.graphql(`
      {
        codeDiscountNodes(first: 50) {
          edges {
            node {
              id
              codeDiscount {
                __typename
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                }
                ... on DiscountCodeBxgy {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  customerBuys {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                  customerGets {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                  }
                }
                ... on DiscountCodeFreeShipping {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                  startsAt
                  endsAt
                  status
                  destinationSelection {
                    ... on DiscountCountryAll {
                      allCountries
                    }
                  }
                }
              }
            }
          }
        }
        automaticDiscountNodes(first: 50) {
          edges {
            node {
              id
              automaticDiscount {
                __typename
                ... on DiscountAutomaticBasic {
                  title
                  startsAt
                  endsAt
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
                ... on DiscountAutomaticBxgy {
                  title
                  startsAt
                  endsAt
                  status
                  customerBuys {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                  }
                  customerGets {
                    items {
                      ... on AllDiscountItems {
                        allItems
                      }
                    }
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    const discountsData = await discountsResponse.json();

    const codeDiscounts = discountsData.data.codeDiscountNodes.edges.map(
      ({ node }) => {
        const d = node.codeDiscount;
        return {
          shopifyId: parseInt(extractNumericId(node.id)),
          title: d.title,
          code: d.codes?.edges[0]?.node?.code,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          status: d.status,
          type: d.__typename,
          value: d.customerGets?.value?.percentage
            ? `${d.customerGets.value.percentage}%`
            : d.customerGets?.value?.amount?.amount
              ? `${d.customerGets.value.amount.amount} ${d.customerGets.value.amount.currencyCode}`
              : "Free Shipping",
          appliesTo: d.customerGets?.items?.allItems
            ? "All Items"
            : "Specific Items",
        };
      },
    );

    const automaticDiscounts =
      discountsData.data.automaticDiscountNodes.edges.map(({ node }) => {
        const d = node.automaticDiscount;
        return {
          shopifyId: parseInt(extractNumericId(node.id)),
          title: d.title,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          status: d.status,
          type: d.__typename,
          value: d.customerGets?.value?.percentage
            ? `${d.customerGets.value.percentage}%`
            : d.customerGets?.value?.amount?.amount
              ? `${d.customerGets.value.amount.amount} ${d.customerGets.value.amount.currencyCode}`
              : null,
          appliesTo: d.customerGets?.items?.allItems
            ? "All Items"
            : "Specific Items",
        };
      });

    // ---------------------
    // Combine final data
    // ---------------------
    const formattedData = {
      shop: shopData.data.shop,
      products: mergedProducts,
      collections: formattedCollections,
      pages: mergedPages,
      blogs: mergedBlogs,
      discounts: {
        codeDiscounts,
        automaticDiscounts,
      },
    };

    console.log("Sync completed successfully");
    return json(formattedData);
  } catch (error) {
    console.error("Detailed sync error:", {
      message: error.message,
      stack: error.stack,
    });
    return json(
      {
        error: "Failed to fetch Shopify data",
        details: error.message,
      },
      { status: 500 },
    );
  }
};
