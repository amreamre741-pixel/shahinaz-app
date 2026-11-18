
"use strict";

/* =====================================
   SHAHINAZ — IN-APP NOTIFICATIONS
===================================== */

(function () {
  let notificationRows = [];
  let notificationChannel = null;
  let notificationStartedFor = null;
  let notificationBusy = false;

  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

  const notificationTypes = {
    like: { icon: "❤️", title: "إعجاب جديد" },
    comment: { icon: "💬", title: "تعليق جديد" },
    friend_request: { icon: "👥", title: "طلب صداقة" },
    message: { icon: "💌", title: "رسالة جديدة" }
  };

  function timeAgo(value) {
    if (!value) return "";

    const date = new Date(value);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (!Number.isFinite(seconds) || seconds < 0) {
      return date.toLocaleString("ar-DZ");
    }

    if (seconds < 60) return "الآن";
    if (seconds < 3600) return `قبل ${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `قبل ${Math.floor(seconds / 3600)} ساعة`;
    if (seconds < 604800) return `قبل ${Math.floor(seconds / 86400)} يوم`;

    return date.toLocaleDateString("ar-DZ");
  }

  function buildInterface() {
    if (!document.getElementById("shahinazBell")) {
      const header = document.querySelector("header");
      if (!header) return;

      const headerActions = header.querySelector("div");
      if (!headerActions) return;

      const bell = document.createElement("button");
      bell.id = "shahinazBell";
      bell.type = "button";
      bell.title = "الإشعارات";
      bell.setAttribute("aria-label", "فتح الإشعارات");
      bell.innerHTML = '🔔<span class="notification-count" id="shahinazUnreadCount"></span>';

      const oldBell = document.getElementById("notificationBtn");
      if (oldBell) {
        oldBell.insertAdjacentElement("beforebegin", bell);
      } else {
        headerActions.prepend(bell);
      }

      bell.addEventListener("click", openCenter);
    }

    if (!document.getElementById("shahinazNotifications")) {
      const overlay = document.createElement("div");
      overlay.id = "shahinazNotifications";
      overlay.hidden = true;

      overlay.innerHTML = `
        <div class="notification-window" role="dialog" aria-modal="true" aria-label="الإشعارات">
          <div class="notification-heading">
            <div>
              <h2>الإشعارات 🔔</h2>
              <p id="notificationSubtitle">آخر نشاط في حسابك</p>
            </div>
            <button type="button" class="notification-close" id="closeNotificationCenter">✕</button>
          </div>

          <div class="notification-tools">
            <button type="button" id="markAllNotificationsRead">✓ تحديد الكل كمقروء</button>
            <button type="button" id="refreshNotifications">↻ تحديث</button>
          </div>

          <div class="notification-list" id="notificationList">
            <div class="notification-loading">جاري تحميل الإشعارات...</div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.addEventListener("click", event => {
        if (event.target === overlay) closeCenter();
      });

      document.getElementById("closeNotificationCenter")
        .addEventListener("click", closeCenter);

      document.getElementById("markAllNotificationsRead")
        .addEventListener("click", markAllRead);

      document.getElementById("refreshNotifications")
        .addEventListener("click", loadNotifications);

      document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeCenter();
      });
    }
  }

  function openCenter() {
    const overlay = document.getElementById("shahinazNotifications");
    if (!overlay) return;

    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    loadNotifications();
  }

  function closeCenter() {
    const overlay = document.getElementById("shahinazNotifications");
    if (!overlay) return;

    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function updateBadge() {
    const badge = document.getElementById("shahinazUnreadCount");
    if (!badge) return;

    const count = notificationRows.filter(item => !item.is_read).length;

    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = count > 0 ? "flex" : "none";

    const subtitle = document.getElementById("notificationSubtitle");
    if (subtitle) {
      subtitle.textContent = count
        ? `لديك ${count} إشعار غير مقروء`
        : "أنت مطّلع على كل جديد";
    }

    const markButton = document.getElementById("markAllNotificationsRead");
    if (markButton) markButton.disabled = count === 0;
  }

  async function loadNotifications() {
    if (!db || !user || notificationBusy) return;

    notificationBusy = true;

    const list = document.getElementById("notificationList");
    if (list) {
      list.innerHTML = '<div class="notification-loading">جاري تحميل الإشعارات...</div>';
    }

    try {
      const { data, error } = await db
        .from("notifications")
        .select("id,recipient_id,actor_id,type,message,post_id,is_read,created_at")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      notificationRows = data || [];
      await loadActorProfiles();
      renderNotifications();
    } catch (error) {
      console.error("Notifications error:", error);

      if (list) {
        list.innerHTML = `
          <div class="notification-empty">
            <span class="empty-icon">⚠️</span>
            تعذّر تحميل الإشعارات. حاول التحديث.
          </div>`;
      }
    } finally {
      notificationBusy = false;
      updateBadge();
    }
  }

  async function loadActorProfiles() {
    const ids = [...new Set(
      notificationRows
        .map(item => item.actor_id)
        .filter(Boolean)
    )];

    if (!ids.length) return;

    try {
      const { data, error } = await db
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", ids);

      if (error) throw error;

      const profiles = new Map((data || []).map(profile => [
        profile.id,
        profile
      ]));

      notificationRows = notificationRows.map(item => ({
        ...item,
        actorProfile: profiles.get(item.actor_id) || null
      }));
    } catch (error) {
      console.warn("Could not load notification profiles:", error);
    }
  }

  function renderNotifications() {
    const list = document.getElementById("notificationList");
    if (!list) return;

    updateBadge();

    if (!notificationRows.length) {
      list.innerHTML = `
        <div class="notification-empty">
          <span class="empty-icon">🔔</span>
          لا توجد إشعارات حاليا
          <p>عندما يتفاعل أصدقاؤك معك ستظهر الإشعارات هنا</p>
        </div>`;
      return;
    }

    list.innerHTML = notificationRows.map(item => {
      const type = notificationTypes[item.type] || {
        icon: "🔔",
        title: "إشعار جديد"
      };

      const actorName = item.actorProfile?.display_name || "مستخدم SHAHINAZ";
      const message = item.message || type.title;

      return `
        <article class="notification-item ${item.is_read ? "" : "unread"}"
          data-notification-id="${escapeText(item.id)}">

          <div class="notification-icon">${type.icon}</div>

          <div class="notification-content"
            data-open-notification="${escapeText(item.id)}">
            <strong>${escapeText(actorName)}</strong>
            <p>${escapeText(message)}</p>
            <time>${escapeText(timeAgo(item.created_at))}</time>
          </div>

          ${item.is_read ? "" : '<span class="notification-unread-dot"></span>'}

          <button type="button"
            class="notification-delete"
            data-delete-notification="${escapeText(item.id)}"
            aria-label="حذف الإشعار"
            title="حذف">✕</button>
        </article>`;
    }).join("");

    list.querySelectorAll("[data-open-notification]").forEach(element => {
      element.addEventListener("click", () => {
        openNotification(element.dataset.openNotification);
      });
    });

    list.querySelectorAll("[data-delete-notification]").forEach(element => {
      element.addEventListener("click", () => {
        deleteNotification(element.dataset.deleteNotification);
      });
    });
  }

  async function markOneRead(id) {
    const item = notificationRows.find(row => row.id === id);
    if (!item || item.is_read) return;

    const { error } = await db
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("recipient_id", user.id);

    if (error) throw error;

    item.is_read = true;
    renderNotifications();
  }

  async function markAllRead() {
    if (!db || !user) return;

    const unread = notificationRows.some(item => !item.is_read);
    if (!unread) return;

    const button = document.getElementById("markAllNotificationsRead");
    if (button) button.disabled = true;

    try {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false);

      if (error) throw error;

      notificationRows = notificationRows.map(item => ({
        ...item,
        is_read: true
      }));

      renderNotifications();
    } catch (error) {
      console.error(error);
      alert("تعذّر تحديد الإشعارات كمقروءة.");
    } finally {
      updateBadge();
    }
  }

  async function deleteNotification(id) {
    if (!db || !user) return;

    try {
      const { error } = await db
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("recipient_id", user.id);

      if (error) throw error;

      notificationRows = notificationRows.filter(item => item.id !== id);
      renderNotifications();
    } catch (error) {
      console.error(error);
      alert("تعذّر حذف الإشعار.");
    }
  }

  async function openNotification(id) {
    const item = notificationRows.find(row => row.id === id);
    if (!item) return;

    try {
      await markOneRead(id);
    } catch (error) {
      console.error(error);
    }

    closeCenter();

    if (item.type === "message") {
      if (item.actor_id && typeof openChat === "function") {
        try {
          await openChat(item.actor_id);
        } catch (error) {
          console.error(error);
          alert("تعذّر فتح المحادثة. ربما لم تعد هذه المحادثة متاحة.");
        }
      } else {
        alert("لا يمكن فتح هذه المحادثة.");
      }
      return;
    }

    if (item.type === "friend_request") {
      showSection("friends");
      const requests = document.getElementById("incomingRequests");
      if (requests) requests.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (item.type === "like" || item.type === "comment") {
      showSection("home");

      if (item.post_id) {
        setTimeout(() => {
          const post = document.querySelector(
            `[data-post-id="${CSS.escape(item.post_id)}"]`
          );

          if (post) {
            post.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 350);
      }
    }
  }

  function showSection(section) {
    const feed = document.getElementById("feedArea");
    const profile = document.getElementById("profilePanel");
    const friends = document.getElementById("friendsPanel");
    const chat = document.getElementById("chatPanel");
    const nav = document.getElementById("bottomNav");

    if (feed) feed.hidden = section !== "home";
    if (profile) profile.hidden = section !== "profile";
    if (friends) friends.hidden = section !== "friends";
    if (chat) chat.hidden = true;
    if (nav) nav.hidden = false;

    document.querySelectorAll(".bottom button").forEach(button => {
      button.classList.remove("active");
    });

    const activeId = {
      home: "homeTab",
      friends: "friendsTab",
      profile: "profileTab"
    }[section];

    if (activeId) {
      document.getElementById(activeId)?.classList.add("active");
    }
  }

  function stopRealtime() {
    if (notificationChannel && db) {
      db.removeChannel(notificationChannel);
    }

    notificationChannel = null;
    notificationStartedFor = null;
    notificationRows = [];
    updateBadge();
  }

  function startRealtime() {
    if (!db || !user) return;

    if (notificationStartedFor === user.id && notificationChannel) return;

    stopRealtime();
    notificationStartedFor = user.id;

    notificationChannel = db
      .channel("shahinaz-notifications-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "recipient_id=eq." + user.id
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Notification realtime channel error");
        }
      });

    loadNotifications();
  }

  function initializeForCurrentUser() {
    buildInterface();

    if (!db || !user) {
      stopRealtime();
      return;
    }

    if (notificationStartedFor !== user.id) {
      startRealtime();
    } else {
      updateBadge();
    }
  }

  /*
    نربط مركز الإشعارات بدالة تسجيل الدخول الموجودة
    دون تعديل app.js.
  */
  if (typeof showUser === "function") {
    const originalShowUser = showUser;

    showUser = async function () {
      const result = await originalShowUser.apply(this, arguments);

      try {
        initializeForCurrentUser();
      } catch (error) {
        console.error("Notification initialization error:", error);
      }

      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", buildInterface);

  buildInterface();
})();
