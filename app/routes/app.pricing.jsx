import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  List,
  InlineStack,
  Icon,
  Box,
  Badge,
} from "@shopify/polaris";
import {
  CheckIcon,
  StarIcon,
  MicrophoneIcon,
  ClockIcon,
  ChatIcon,
  GlobeIcon,
  ChartLineIcon,
  PageIcon,
  TeamIcon,
  DatabaseIcon,
  CodeIcon,
  NotificationIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  // Get Shopify subscription status
  const response = await admin.graphql(`
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const subscriptions = data.data.appInstallation.activeSubscriptions;

  // Find the active paid subscription
  const activePaidSubscription = subscriptions.find(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.lineItems[0]?.plan?.pricingDetails?.price?.amount > 0,
  );

  // Get the access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;

  // Return the disconnected status if no access key found
  if (!accessKey) {
    return json({
      disconnected: true,
      activeSubscriptions: subscriptions,
      isPro: !!activePaidSubscription,
      currentPlan: activePaidSubscription ? "Pro Plan" : "Basic Plan",
      subscriptionEnds: activePaidSubscription?.currentPeriodEnd,
      shop,
    });
  }

  if (accessKey) {
    try {
      // Check current API subscription status
      const apiResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      });

      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        const apiPlan = apiData.website?.plan || "Free";
        const shopifyPlan = activePaidSubscription ? "Pro" : "Free";

        // If there's a mismatch, sync the plans
        if (apiPlan !== shopifyPlan) {
          const updateResponse = await fetch(
            `${urls.voiceroApi}/api/shopify/updateFromShopify`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${accessKey}`,
              },
              body: JSON.stringify({
                plan: shopifyPlan,
                queryLimit: shopifyPlan === "Pro" ? 50000 : 10000,
                subscriptionEnds:
                  activePaidSubscription?.currentPeriodEnd || null,
              }),
            },
          );

          if (!updateResponse.ok) {
            console.error("Failed to sync subscription with API");
          }
        }
      }
    } catch (error) {
      console.error("Error checking API subscription:", error);
    }
  }

  return json({
    activeSubscriptions: subscriptions,
    isPro: !!activePaidSubscription,
    currentPlan: activePaidSubscription ? "Pro Plan" : "Basic Plan",
    subscriptionEnds: activePaidSubscription?.currentPeriodEnd,
    shop,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  try {
    // Redirect to Shopify-managed pricing page
    const managedPricingUrl = `https://admin.shopify.com/store/${shop.split(".")[0]}/charges/voicero-app-shop/pricing_plans`;

    return json({
      success: true,
      managedPricingUrl,
    });
  } catch (error) {
    console.error("Pricing error:", error);
    return json({
      success: false,
      error:
        error.message || "Failed to access pricing plans. Please try again.",
    });
  }
};

export default function PricingPage() {
  const {
    activeSubscriptions,
    isPro,
    currentPlan,
    subscriptionEnds,
    disconnected,
    shop,
  } = useLoaderData();
  const fetcher = useFetcher();
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const navigate = useNavigate();

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Format shop domain for managed pricing URL
  const shopName = shop ? shop.split(".")[0] : "";
  const managedPricingUrl = `https://admin.shopify.com/store/${shopName}/charges/voicero-app-shop/pricing_plans`;

  // Add subscription status banner
  const getSubscriptionBanner = () => {
    if (isPro) {
      const endDate = new Date(subscriptionEnds).toLocaleDateString();
      return (
        <Banner status="success">
          <p>
            You are currently on the Pro Plan. Your subscription renews on{" "}
            {endDate}.
          </p>
        </Banner>
      );
    }
    return (
      <Banner status="info">
        <p>You are currently on the Basic Plan.</p>
      </Banner>
    );
  };

  // Update the useEffect hook to handle the redirect to Shopify Managed Pricing
  useEffect(() => {
    if (fetcher.data?.managedPricingUrl) {
      // Open in new tab instead of redirecting in the iframe
      window.open(fetcher.data.managedPricingUrl, "_top");
    }
    // Show error from action if any
    if (fetcher.data?.error) {
      setError(fetcher.data.error);
      setSuccessMessage(null);
    }
  }, [fetcher.data]);

  const navigateToManagedPricing = () => {
    setSuccessMessage(null);
    setError(null);
    fetcher.submit({}, { method: "POST" });
  };

  // Feature list with icons
  const basicFeatures = [
    { icon: DatabaseIcon, text: "200 AI chats per month" },
    { icon: MicrophoneIcon, text: "Basic voice commands" },
    { icon: ClockIcon, text: "Standard response time" },
    { icon: ChatIcon, text: "Community support" },
    { icon: GlobeIcon, text: "Single website integration" },
    { icon: ChartLineIcon, text: "Basic analytics" },
    { icon: PageIcon, text: "Documentation access" },
    { icon: null, text: "" }, // Empty items to match pro features count
    { icon: null, text: "" },
  ];

  const proFeatures = [
    { icon: DatabaseIcon, text: "50,000 AI chats per month" },
    { icon: MicrophoneIcon, text: "Advanced voice commands" },
    { icon: ChatIcon, text: "Priority email support" },
    { icon: GlobeIcon, text: "Multiple website integration" },
    { icon: ChartLineIcon, text: "Advanced analytics dashboard" },
    { icon: CodeIcon, text: "Custom voice commands" },
    { icon: TeamIcon, text: "Team collaboration tools" },
    { icon: NotificationIcon, text: "Regular feature updates" },
  ];

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  return (
    <Page
      title="Subscription Plans"
      backAction={{
        content: "Back",
        onAction: () => navigate("/app"),
      }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {getSubscriptionBanner()}
            <Card>
              <BlockStack gap="400">
                {error && (
                  <Banner status="critical" onDismiss={() => setError(null)}>
                    <p>{error}</p>
                  </Banner>
                )}

                {successMessage && (
                  <Banner
                    status="success"
                    onDismiss={() => setSuccessMessage(null)}
                  >
                    <p>{successMessage}</p>
                  </Banner>
                )}

                <Text as="h2" variant="headingLg" alignment="center">
                  Choose the right plan for your business
                </Text>

                <Text as="p" variant="bodyMd" alignment="center" tone="subdued">
                  You are currently on the {isPro ? "Pro" : "Basic"} Plan
                </Text>

                <Banner status="info">
                  <Text variant="bodyMd">
                    To view all available plans or change your subscription,
                    please click the button below to access Shopify's
                    subscription management.
                  </Text>
                  <Box paddingBlockStart="300">
                    <Button primary onClick={navigateToManagedPricing}>
                      Manage Subscription
                    </Button>
                  </Box>
                </Banner>

                <BlockStack gap="500">
                  <Layout>
                    <Layout.Section variant="oneHalf">
                      {/* Basic Plan Card */}
                      <div style={{ height: "100%" }}>
                        <Card>
                          <BlockStack gap="400">
                            <Box
                              paddingBlockStart="300"
                              paddingBlockEnd="300"
                              background="bg-surface-secondary"
                              borderRadius="300 300 0 0"
                            >
                              <BlockStack gap="200" align="center">
                                <Badge>Free</Badge>
                                <Text
                                  as="h3"
                                  variant="headingMd"
                                  alignment="center"
                                >
                                  Basic Plan
                                </Text>
                                <Text
                                  as="p"
                                  variant="headingXl"
                                  alignment="center"
                                >
                                  $0
                                </Text>
                                <Text
                                  as="p"
                                  variant="bodyMd"
                                  tone="subdued"
                                  alignment="center"
                                >
                                  Perfect for trying out our platform
                                </Text>
                                {currentPlan === "Basic Plan" && (
                                  <Badge tone="success">Current Plan</Badge>
                                )}
                              </BlockStack>
                            </Box>

                            <Box padding="400">
                              <BlockStack gap="400">
                                {basicFeatures.map((feature, index) => (
                                  <InlineStack
                                    key={index}
                                    gap="300"
                                    blockAlign="center"
                                    align="space-between"
                                  >
                                    {feature.icon ? (
                                      <>
                                        <div
                                          style={{
                                            width: "24px",
                                            display: "flex",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <Icon
                                            source={feature.icon}
                                            color="primary"
                                          />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <Text variant="bodyMd">
                                            {feature.text}
                                          </Text>
                                        </div>
                                      </>
                                    ) : (
                                      <div style={{ height: "24px" }}></div>
                                    )}
                                  </InlineStack>
                                ))}

                                <Box paddingBlockStart="300">
                                  <Button
                                    fullWidth
                                    onClick={navigateToManagedPricing}
                                    size="large"
                                  >
                                    Manage Subscription
                                  </Button>
                                </Box>
                              </BlockStack>
                            </Box>
                          </BlockStack>
                        </Card>
                      </div>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      {/* Premium Plan Card */}
                      <div style={{ height: "100%" }}>
                        <Card>
                          <BlockStack gap="400">
                            <Box
                              paddingBlockStart="300"
                              paddingBlockEnd="300"
                              background="bg-surface-primary-subdued"
                              borderRadius="300 300 0 0"
                              style={{
                                backgroundColor: "rgba(136, 43, 230, 0.1)",
                              }}
                            >
                              <BlockStack gap="200" align="center">
                                <Badge tone="info">Recommended</Badge>
                                <Text
                                  as="h3"
                                  variant="headingMd"
                                  alignment="center"
                                >
                                  Growth Plan
                                </Text>
                                <Text
                                  as="p"
                                  variant="headingXl"
                                  alignment="center"
                                >
                                  $40
                                </Text>
                                <Text
                                  as="p"
                                  variant="bodyMd"
                                  tone="subdued"
                                  alignment="center"
                                >
                                  Ideal for small to medium businesses
                                </Text>
                                {currentPlan === "Pro Plan" && (
                                  <Badge tone="info">Current Plan</Badge>
                                )}
                              </BlockStack>
                            </Box>

                            <Box padding="400">
                              <BlockStack gap="400">
                                {proFeatures.map((feature, index) => (
                                  <InlineStack
                                    key={index}
                                    gap="300"
                                    blockAlign="center"
                                    align="space-between"
                                  >
                                    <div
                                      style={{
                                        width: "24px",
                                        display: "flex",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Icon
                                        source={feature.icon}
                                        color="primary"
                                      />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <Text variant="bodyMd">
                                        {feature.text}
                                      </Text>
                                    </div>
                                  </InlineStack>
                                ))}

                                <Box paddingBlockStart="300">
                                  <Button
                                    primary
                                    fullWidth
                                    onClick={navigateToManagedPricing}
                                    size="large"
                                  >
                                    Manage Subscription
                                  </Button>
                                </Box>
                              </BlockStack>
                            </Box>
                          </BlockStack>
                        </Card>
                      </div>
                    </Layout.Section>
                  </Layout>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
