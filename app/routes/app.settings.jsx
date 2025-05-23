import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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

  if (!accessKey) {
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  try {
    // Fetch website data from the connect API
    const response = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      return json({
        error: "Failed to fetch website data",
      });
    }

    const data = await response.json();
    if (!data.website) {
      return json({
        error: "No website data found",
      });
    }

    return json({
      websiteData: data.website,
      accessKey,
    });
  } catch (error) {
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // Get access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          id
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;
  const metafieldId = metafieldData.data.shop.metafield?.id;

  if (!accessKey && action !== "disconnect") {
    return json({
      success: false,
      error: "Access key not found",
    });
  }

  try {
    if (action === "update") {
      // Parse the form data
      const active = formData.get("active") === "true";
      const name = formData.get("name");
      const url = formData.get("url");
      const customInstructions = formData.get("customInstructions");

      // Prepare the update payload
      const updates = {
        name,
        url,
        customInstructions,
        active,
      };

      // Call the editInfoFromShopify API
      const response = await fetch(
        `${urls.voiceroApi}/api/shopify/editInfoFromShopify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update settings");
      }

      const data = await response.json();
      return json({
        success: true,
        data: data.website,
        message: "Settings updated successfully!",
      });
    } else if (action === "disconnect") {
      // Use our API endpoint to delete the access key
      try {
        // Get the URL origin from the current request
        const url = new URL(request.url);
        const baseUrl = url.origin;

        // Use a fully qualified URL for server-side fetch with proper error handling
        const response = await fetch(`${baseUrl}/api/accessKey`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        await response.json();
      } catch (error) {
        // Continue with disconnect process even if API call fails
      }

      return json({
        success: true,
        disconnected: true,
        message: "Successfully disconnected from VoiceroAI",
      });
    }
  } catch (error) {
    return json({
      success: false,
      error: error.message || "Operation failed",
    });
  }
};

export default function SettingsPage() {
  const { websiteData, accessKey, error, disconnected } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [formData, setFormData] = useState({
    name: websiteData?.name || "",
    url: websiteData?.url || "",
    customInstructions: websiteData?.customInstructions || "",
    active: websiteData?.active || false,
  });

  // User data state
  const [userData, setUserData] = useState({
    name: "",
    username: "",
    email: "",
  });

  const [userDataLoading, setUserDataLoading] = useState(true);
  const [userDataError, setUserDataError] = useState(null);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Fetch user data from the API
  useEffect(() => {
    if (accessKey) {
      setUserDataLoading(true);
      fetch("/api/user/me")
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch user data");
          }
          return response.json();
        })
        .then((data) => {
          if (data.user) {
            setUserData({
              name: data.user.name || "",
              username: data.user.username || "",
              email: data.user.email || "",
            });
          }
          setUserDataLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching user data:", err);
          setUserDataError(err.message);
          setUserDataLoading(false);
        });
    }
  }, [accessKey]);

  // Add CSS styles
  const styles = {
    container: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "20px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
    },
    title: {
      fontSize: "24px",
      fontWeight: "bold",
      margin: 0,
    },
    backButton: {
      padding: "8px 16px",
      backgroundColor: "#f1f1f1",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
    },
    badge: {
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "bold",
      color: "white",
      backgroundColor: websiteData?.active ? "#008060" : "#d82c0d",
    },
    card: {
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      padding: "20px",
      marginBottom: "20px",
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "15px",
    },
    cardTitle: {
      fontSize: "16px",
      fontWeight: "bold",
      margin: 0,
    },
    divider: {
      height: "1px",
      backgroundColor: "#e1e3e5",
      margin: "15px 0",
    },
    infoRow: {
      display: "flex",
      alignItems: "flex-start",
      marginBottom: "10px",
    },
    label: {
      fontWeight: "bold",
      marginRight: "8px",
      width: "100px",
    },
    inputField: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      fontSize: "14px",
    },
    textArea: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      fontSize: "14px",
      minHeight: "100px",
    },
    button: {
      padding: "8px 16px",
      backgroundColor: "#008060",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
    },
    secondaryButton: {
      padding: "8px 16px",
      backgroundColor: "white",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      marginRight: "8px",
    },
    destructiveButton: {
      padding: "8px 16px",
      backgroundColor: "#d82c0d",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
    },
    toast: {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      padding: "16px 20px",
      backgroundColor: showToast
        ? toastType === "critical"
          ? "#fedfe2"
          : "#e2f5e7"
        : "transparent",
      color: toastType === "critical" ? "#d82c0d" : "#008060",
      borderRadius: "8px",
      boxShadow: "0 0 10px rgba(0,0,0,0.1)",
      zIndex: 9999,
      display: showToast ? "flex" : "none",
      alignItems: "center",
      justifyContent: "space-between",
      maxWidth: "400px",
    },
    modal: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 1000,
      display: showDisconnectModal ? "flex" : "none",
      alignItems: "center",
      justifyContent: "center",
    },
    modalContent: {
      backgroundColor: "white",
      borderRadius: "8px",
      padding: "20px",
      maxWidth: "500px",
      width: "90%",
    },
    modalHeader: {
      fontSize: "18px",
      fontWeight: "bold",
      marginBottom: "15px",
    },
    modalActions: {
      display: "flex",
      justifyContent: "flex-end",
      marginTop: "20px",
    },
    progressBar: {
      width: "100%",
      height: "4px",
      backgroundColor: "#f5f5f5",
      borderRadius: "2px",
      overflow: "hidden",
      position: "relative",
    },
    progressBarInner: {
      position: "absolute",
      width: "30%",
      height: "100%",
      backgroundColor: "#008060",
      borderRadius: "2px",
      animation: "loading 1.5s infinite ease-in-out",
      left: "-30%",
    },
  };

  const handleSave = () => {
    // Create a copy of formData without including lastSyncedAt
    const dataToSubmit = {
      action: "update",
      name: formData.name,
      url: formData.url,
      customInstructions: formData.customInstructions,
      active: formData.active.toString(),
    };

    fetcher.submit(dataToSubmit, { method: "POST" });
    setIsEditing(false);
    setShowToast(true);
    setToastMessage("Settings updated successfully!");
    setToastType("success");
  };

  const toggleStatus = async () => {
    try {
      // Call the toggle-status API
      const response = await fetch(
        `${urls.voiceroApi}/api/websites/toggle-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({ accessKey }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle status");
      }

      const data = await response.json();

      // Update the local state based on the response
      setFormData({
        ...formData,
        active: data.status === "active",
      });

      setShowToast(true);
      setToastMessage(
        `AI Assistant ${data.status === "active" ? "activated" : "deactivated"} successfully!`,
      );
      setToastType("success");
    } catch (error) {
      console.error("Error toggling status:", error);
      setShowToast(true);
      setToastMessage(error.message || "Failed to toggle status");
      setToastType("critical");
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(false);

    fetch("/api/accessKey", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return { success: false, error: "HTTP error" };
        }
        return response.json().catch(() => ({
          success: false,
          error: "JSON parse error",
        }));
      })
      .finally(() => {
        fetcher.submit({ action: "disconnect" }, { method: "POST" });
        setTimeout(() => {
          navigate("/app");
        }, 2000);
      });
  };

  const toggleToast = () => setShowToast(!showToast);

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Handle form data from action
  useEffect(() => {
    if (fetcher.data?.disconnected) {
      navigate("/app");
    } else if (fetcher.data?.error) {
      setShowToast(true);
      setToastMessage(fetcher.data.error);
      setToastType("critical");
    } else if (fetcher.data?.success) {
      // Update form data with the new data from the server
      if (fetcher.data.data) {
        setFormData({
          name: fetcher.data.data.name || "",
          url: fetcher.data.data.url || "",
          customInstructions: fetcher.data.data.customInstructions || "",
          active: fetcher.data.data.active || false,
        });
      }

      setShowToast(true);
      setToastMessage(
        fetcher.data.message || "Operation completed successfully",
      );
      setToastType("success");
    }
  }, [fetcher.data, navigate]);

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div
          style={{
            ...styles.card,
            backgroundColor: "#fedfe2",
            color: "#d82c0d",
          }}
        >
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate("/app")}>
          Back
        </button>
        <h1 style={styles.title}>Website Settings</h1>
        <span style={styles.badge}>
          {websiteData?.active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Connection Settings */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Connection Settings</h2>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Access Key:</span>
          <span
            style={{
              padding: "4px 8px",
              backgroundColor: "#f6f6f7",
              borderRadius: "4px",
            }}
          >
            {accessKey}
          </span>
        </div>
        <div style={styles.infoRow}>
          <span style={{ width: "100px" }}></span>
          <div>
            <button
              style={{ ...styles.destructiveButton, marginRight: "10px" }}
              onClick={() => setShowDisconnectModal(true)}
            >
              Disconnect Website
            </button>
            <button
              style={styles.destructiveButton}
              onClick={() =>
                window.open("https://www.voicero.ai/app/settings", "_blank")
              }
            >
              Delete Website
            </button>
          </div>
        </div>
      </div>

      {/* Website Information */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Website Information</h2>
          {isEditing ? (
            <div>
              <button
                style={styles.secondaryButton}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button style={styles.button} onClick={handleSave}>
                Save Changes
              </button>
            </div>
          ) : (
            <button
              style={styles.secondaryButton}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Status:</span>
          <div>
            <span
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                backgroundColor: formData.active ? "#e2f5e7" : "#fedfe2",
                color: formData.active ? "#008060" : "#d82c0d",
                marginRight: "10px",
              }}
            >
              {formData.active ? "Active" : "Inactive"}
            </span>
            <button style={styles.secondaryButton} onClick={toggleStatus}>
              {formData.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Website Name:</label>
          <input
            type="text"
            style={styles.inputField}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={!isEditing}
          />
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Website URL:</label>
          <input
            type="text"
            style={styles.inputField}
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            disabled={!isEditing}
          />
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Custom Instructions:</label>
          <textarea
            style={styles.textArea}
            value={formData.customInstructions}
            onChange={(e) =>
              setFormData({ ...formData, customInstructions: e.target.value })
            }
            disabled={!isEditing}
          />
        </div>
      </div>

      {/* User Settings */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>User Settings</h2>
          {isEditingUser ? (
            <div>
              <button
                style={styles.secondaryButton}
                onClick={() => setIsEditingUser(false)}
              >
                Cancel
              </button>
              <button
                style={styles.button}
                onClick={() => {
                  setIsEditingUser(false);
                  setShowToast(true);
                  setToastMessage("User settings updated successfully!");
                  setToastType("success");
                }}
              >
                Save Changes
              </button>
            </div>
          ) : (
            <button
              style={styles.secondaryButton}
              onClick={() => setIsEditingUser(true)}
              disabled={userDataLoading}
            >
              Edit
            </button>
          )}
        </div>
        <div style={styles.divider}></div>

        {userDataLoading ? (
          <div style={styles.progressBar}>
            <div style={styles.progressBarInner}></div>
            <style>{`
              @keyframes loading {
                0% { transform: translateX(0); }
                100% { transform: translateX(433%); }
              }
            `}</style>
          </div>
        ) : userDataError ? (
          <div
            style={{
              padding: "10px",
              backgroundColor: "#fedfe2",
              color: "#d82c0d",
              borderRadius: "4px",
            }}
          >
            <p>Failed to load user data: {userDataError}</p>
          </div>
        ) : (
          <>
            <div style={styles.infoRow}>
              <label style={styles.label}>Name:</label>
              <input
                type="text"
                style={styles.inputField}
                value={userData.name}
                onChange={(e) =>
                  setUserData({ ...userData, name: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
            <div style={styles.infoRow}>
              <label style={styles.label}>Username:</label>
              <input
                type="text"
                style={styles.inputField}
                value={userData.username}
                onChange={(e) =>
                  setUserData({ ...userData, username: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
            <div style={styles.infoRow}>
              <label style={styles.label}>Email:</label>
              <input
                type="email"
                style={styles.inputField}
                value={userData.email}
                onChange={(e) =>
                  setUserData({ ...userData, email: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
          </>
        )}
      </div>

      {/* Subscription Information */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Subscription Information</h2>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Current Plan:</span>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "#f6f6f7",
            }}
          >
            {websiteData.plan || "Free"}
          </span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Price:</span>
          <span>{websiteData.plan === "free" ? "$0/month" : "$19/month"}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Last Synced:</span>
          <span>
            {websiteData.lastSyncedAt
              ? new Date(websiteData.lastSyncedAt).toLocaleString()
              : "Never"}
          </span>
        </div>
        <div style={styles.infoRow}>
          <span style={{ width: "100px" }}></span>
          <button
            style={styles.secondaryButton}
            onClick={() =>
              window.open(
                `https://www.voicero.ai/app/websites/website?id=${websiteData.id}`,
                "_blank",
              )
            }
          >
            Update Subscription
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      <div style={styles.toast}>
        <span>{toastMessage}</span>
        <button
          onClick={toggleToast}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            marginLeft: "12px",
            color: toastType === "critical" ? "#d82c0d" : "#008060",
          }}
        >
          ✕
        </button>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div style={styles.modal} onClick={() => setShowDisconnectModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalHeader}>Disconnect Website</h3>
            <p>
              Are you sure you want to disconnect your website from VoiceroAI?
            </p>
            <p style={{ color: "#d82c0d" }}>
              This action cannot be undone. You will need to reconnect your
              website if you want to use VoiceroAI again.
            </p>
            <div style={styles.modalActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setShowDisconnectModal(false)}
              >
                Cancel
              </button>
              <button
                style={styles.destructiveButton}
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
