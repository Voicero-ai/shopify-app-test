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
    // Get website data to obtain the websiteId
    const websiteResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!websiteResponse.ok) {
      return json({
        error: "Failed to fetch website data",
      });
    }

    const websiteData = await websiteResponse.json();
    const websiteId = websiteData.website?.id;

    if (!websiteId) {
      return json({
        error: "Website ID not found",
      });
    }

    // Use our internal API endpoint to fetch contacts
    const url = new URL(request.url);
    const baseUrl = url.origin;
    const response = await fetch(`${baseUrl}/api/contacts`);

    if (!response.ok) {
      const errorData = await response.json();
      return json({
        error: errorData.error || "Failed to fetch contacts",
      });
    }

    const contactsData = await response.json();
    return json({
      contacts: contactsData.contacts,
      websiteId,
    });
  } catch (error) {
    return json({
      error: error.message || "Failed to fetch contacts",
    });
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");
  const contactId = formData.get("contactId");

  try {
    // Use the URL origin to create a path to our API
    const url = new URL(request.url);
    const baseUrl = url.origin;

    // Create a new FormData object to pass to our API endpoint
    const apiFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      apiFormData.append(key, value);
    }

    // Call our API endpoint for the action
    const response = await fetch(`${baseUrl}/api/contacts`, {
      method: "POST",
      body: apiFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to process action");
    }

    const data = await response.json();
    return json(data);
  } catch (error) {
    return json({
      success: false,
      error: error.message || "Operation failed",
    });
  }
};

export default function ContactsPage() {
  const { contacts, websiteId, error, disconnected } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [currentContact, setCurrentContact] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

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
    card: {
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      padding: "20px",
      marginBottom: "20px",
      overflowX: "auto",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
    },
    th: {
      textAlign: "left",
      padding: "12px 8px",
      borderBottom: "1px solid #e1e3e5",
      color: "#6d7175",
      fontWeight: "600",
    },
    td: {
      padding: "12px 8px",
      borderBottom: "1px solid #e1e3e5",
      verticalAlign: "top",
    },
    button: {
      padding: "8px 16px",
      backgroundColor: "#008060",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      marginRight: "8px",
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
    badge: {
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "bold",
    },
    statusBadge: (read, replied) => ({
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "bold",
      backgroundColor: replied ? "#e2f5e7" : read ? "#f6f6f7" : "#fff3cd",
      color: replied ? "#008060" : read ? "#6d7175" : "#997500",
    }),
    modal: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 1000,
      display: showReplyModal ? "flex" : "none",
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
    textArea: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      fontSize: "14px",
      minHeight: "100px",
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
    noResults: {
      padding: "20px",
      textAlign: "center",
      color: "#6d7175",
    },
    truncate: {
      maxWidth: "300px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
  };

  const handleMarkAsRead = (contactId) => {
    fetcher.submit(
      {
        action: "markAsRead",
        contactId,
        websiteId,
      },
      { method: "POST" },
    );
  };

  const handleOpenReplyModal = (contact) => {
    setCurrentContact(contact);
    setReplyMessage("");
    setShowReplyModal(true);
  };

  const handleSendReply = () => {
    if (!replyMessage.trim()) {
      setShowToast(true);
      setToastMessage("Reply message cannot be empty");
      setToastType("critical");
      return;
    }

    fetcher.submit(
      {
        action: "sendReply",
        contactId: currentContact.id,
        email: currentContact.email,
        message: replyMessage,
        websiteId,
      },
      { method: "POST" },
    );

    setShowReplyModal(false);
  };

  const toggleToast = () => setShowToast(!showToast);

  // Format date to readable format
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Truncate long text
  const truncateText = (text, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  // Handle form data from action
  useEffect(() => {
    if (fetcher.data?.error) {
      setShowToast(true);
      setToastMessage(fetcher.data.error);
      setToastType("critical");
    } else if (fetcher.data?.success) {
      setShowToast(true);
      setToastMessage(
        fetcher.data.message || "Operation completed successfully",
      );
      setToastType("success");

      // Refresh the page to show updated data
      window.location.reload();
    }
  }, [fetcher.data]);

  if (disconnected) {
    navigate("/app");
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
        <h1 style={styles.title}>Contact Messages</h1>
        <span></span>
      </div>

      {/* Contacts Table */}
      <div style={styles.card}>
        {contacts && contacts.length > 0 ? (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Message</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td style={styles.td}>{formatDate(contact.createdAt)}</td>
                  <td style={styles.td}>{contact.email}</td>
                  <td
                    style={{ ...styles.td, ...styles.truncate }}
                    title={contact.message}
                  >
                    {truncateText(contact.message)}
                  </td>
                  <td style={styles.td}>
                    <span
                      style={styles.statusBadge(contact.read, contact.replied)}
                    >
                      {contact.replied
                        ? "Replied"
                        : contact.read
                          ? "Read"
                          : "Unread"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {!contact.read && (
                      <button
                        style={styles.secondaryButton}
                        onClick={() => handleMarkAsRead(contact.id)}
                      >
                        Mark as Read
                      </button>
                    )}
                    <button
                      style={styles.button}
                      onClick={() => handleOpenReplyModal(contact)}
                    >
                      Reply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={styles.noResults}>
            <p>No contact messages found.</p>
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {showReplyModal && (
        <div style={styles.modal} onClick={() => setShowReplyModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalHeader}>Reply to {currentContact?.email}</h3>
            <div style={{ marginBottom: "15px" }}>
              <p>
                <strong>Original Message:</strong>
              </p>
              <p>{currentContact?.message}</p>
            </div>
            <div>
              <p>
                <strong>Your Reply:</strong>
              </p>
              <textarea
                style={styles.textArea}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type your reply here..."
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setShowReplyModal(false)}
              >
                Cancel
              </button>
              <button style={styles.button} onClick={handleSendReply}>
                Send Reply
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
