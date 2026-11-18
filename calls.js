
"use strict";

/* =========================================
   SHAHINAZ — VOICE & VIDEO CALLS
   Version 1.0
========================================= */

let callChannel = null;
let activeCall = null;
let localCallStream = null;
let remoteCallStream = null;
let callPeer = null;
let pendingCallCandidates = [];
let callMuted = false;
let cameraDisabled = false;

const CALL_STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function callElement(id) {
  return document.getElementById(id);
}

function callName() {
  return chatUser?.display_name ||
         chatUser?.username ||
         chatUser?.name ||
         "صديقك";
}

function callStyles() {
  if (callElement("shahinazCallStyles")) return;

  const style = document.createElement("style");
  style.id = "shahinazCallStyles";

  style.textContent = `
    .call-toolbar {
      display:flex;
      gap:8px;
      align-items:center;
      margin-right:auto;
    }

    .call-toolbar button,
    .call-control {
      border:0;
      border-radius:12px;
      padding:10px 13px;
      color:white;
      background:#8050dc;
      font-size:17px;
      cursor:pointer;
    }

    .call-toolbar button:active,
    .call-control:active {
      transform:scale(.96);
    }

    #shahinazCallOverlay {
      position:fixed;
      inset:0;
      z-index:99999;
      background:#171321;
      color:white;
      display:none;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      padding:18px;
      font-family:Arial,sans-serif;
    }

    #shahinazCallOverlay.active {
      display:flex;
    }

    .call-heading {
      font-size:23px;
      font-weight:bold;
      margin-bottom:8px;
    }

    .call-subtitle {
      color:#c7bbd9;
      margin-bottom:22px;
    }

    .call-video-area {
      width:100%;
      max-width:650px;
      height:min(55vh,440px);
      position:relative;
      background:#292333;
      border-radius:18px;
      overflow:hidden;
      display:flex;
      align-items:center;
      justify-content:center;
    }

    #callRemoteVideo {
      width:100%;
      height:100%;
      object-fit:contain;
    }

    #callLocalVideo {
      position:absolute;
      width:115px;
      height:155px;
      right:12px;
      top:12px;
      object-fit:cover;
      background:#111;
      border:2px solid white;
      border-radius:12px;
      z-index:2;
    }

    #callRemoteAudio {
      display:none;
    }

    .call-actions {
      display:flex;
      flex-wrap:wrap;
      justify-content:center;
      gap:12px;
      margin-top:25px;
    }

    .call-control {
      min-width:58px;
      min-height:48px;
    }

    .call-control.end {
      background:#e53955;
    }

    .call-control.accept {
      background:#19a765;
    }

    .call-control.reject {
      background:#e53955;
    }

    .call-hidden {
      display:none !important;
    }

    @media(max-width:480px) {
      .call-toolbar button {
        padding:8px 10px;
        font-size:15px;
      }
      #callLocalVideo {
        width:90px;
        height:125px;
      }
    }
  `;

  document.head.appendChild(style);
}

function createCallInterface() {
  if (callElement("shahinazCallOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "shahinazCallOverlay";

  overlay.innerHTML = `
    <div class="call-heading" id="callHeading">
      مكالمة SHAHINAZ
    </div>

    <div class="call-subtitle" id="callSubtitle">
      جاري الاتصال...
    </div>

    <div class="call-video-area" id="callVideoArea">
      <video id="callRemoteVideo"
        autoplay playsinline></video>

      <video id="callLocalVideo"
        autoplay playsinline muted></video>
    </div>

    <audio id="callRemoteAudio" autoplay></audio>

    <div class="call-actions" id="callIncomingActions">
      <button class="call-control accept" id="callAccept">
        قبول المكالمة
      </button>
      <button class="call-control reject" id="callReject">
        رفض
      </button>
    </div>

    <div class="call-actions call-hidden" id="callActiveActions">
      <button class="call-control" id="callMute">
        🎙️
      </button>
      <button class="call-control" id="callCamera">
        📷
      </button>
      <button class="call-control end" id="callEnd">
        إنهاء
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  callElement("callAccept").onclick = acceptIncomingCall;
  callElement("callReject").onclick = () => endCall("reject");
  callElement("callEnd").onclick = () => endCall("hangup");

  callElement("callMute").onclick = toggleCallMute;
  callElement("callCamera").onclick = toggleCallCamera;
}

function showCallScreen({
  title = "مكالمة SHAHINAZ",
  subtitle = "",
  incoming = false,
  video = false
} = {}) {
  createCallInterface();

  callElement("callHeading").textContent = title;
  callElement("callSubtitle").textContent = subtitle;

  callElement("shahinazCallOverlay").classList.add("active");

  callElement("callIncomingActions")
    .classList.toggle("call-hidden", !incoming);

  callElement("callActiveActions")
    .classList.toggle("call-hidden", incoming);

  callElement("callVideoArea")
    .classList.toggle("call-hidden", !video);

  callElement("callCamera")
    .classList.toggle("call-hidden", !video);
}

function hideCallScreen() {
  const overlay = callElement("shahinazCallOverlay");
  if (overlay) overlay.classList.remove("active");
}

function installCallButtons() {
  callStyles();
  createCallInterface();

  const header = document.querySelector(".chat-top");
  if (!header || header.querySelector(".call-toolbar")) return;

  const toolbar = document.createElement("div");
  toolbar.className = "call-toolbar";

  toolbar.innerHTML = `
    <button type="button" id="startAudioCall"
      title="مكالمة صوتية">📞</button>

    <button type="button" id="startVideoCall"
      title="مكالمة فيديو">📹</button>
  `;

  header.appendChild(toolbar);

  callElement("startAudioCall").onclick =
    () => startCall("audio");

  callElement("startVideoCall").onclick =
    () => startCall("video");
}

async function sendCallSignal(type, payload = {}, targetId = null) {
  if (!activeCall || !conversationId || !user) {
    throw new Error("بيانات المكالمة غير جاهزة");
  }

  const recipient = targetId || activeCall.peerId;

  const { error } = await db
    .from("call_signals")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      recipient_id: recipient,
      signal_type: type,
      payload: {
        ...payload,
        callId: activeCall.callId
      }
    });

  if (error) throw error;
}

function createCallPeer() {
  callPeer = new RTCPeerConnection(CALL_STUN_SERVERS);

  callPeer.onicecandidate = async event => {
    if (!event.candidate || !activeCall) return;

    try {
      await sendCallSignal("ice", {
        candidate: event.candidate.toJSON()
      });
    } catch (error) {
      console.error("ICE signal error:", error);
    }
  };

  callPeer.ontrack = event => {
    if (!remoteCallStream) {
      remoteCallStream = new MediaStream();
    }

    if (!remoteCallStream.getTracks().some(
      track => track.id === event.track.id
    )) {
      remoteCallStream.addTrack(event.track);
    }

    const remoteVideo = callElement("callRemoteVideo");
    const remoteAudio = callElement("callRemoteAudio");

    remoteVideo.srcObject = remoteCallStream;
    remoteAudio.srcObject = remoteCallStream;

    remoteVideo.play().catch(() => {});
    remoteAudio.play().catch(() => {});
  };

  callPeer.onconnectionstatechange = () => {
    if (!callPeer || !activeCall) return;

    const state = callPeer.connectionState;

    if (state === "connected") {
      callElement("callSubtitle").textContent =
        "المكالمة متصلة ❤️";
    }

    if (state === "failed" || state === "disconnected") {
      callElement("callSubtitle").textContent =
        "الاتصال ضعيف أو انقطع";
    }
  };

  if (localCallStream) {
    localCallStream.getTracks().forEach(track => {
      callPeer.addTrack(track, localCallStream);
    });
  }

  return callPeer;
}

async function startCall(type) {
  if (!db || !user) {
    alert("سجّل الدخول أولاً");
    return;
  }

  if (!chatUser || !conversationId) {
    alert("افتح محادثة صديقك أولاً");
    return;
  }

  if (activeCall) {
    alert("لديك مكالمة نشطة بالفعل");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    alert("الميكروفون والكاميرا يحتاجان إلى اتصال HTTPS");
    return;
  }

  const peerId = chatUser.id;

  if (!peerId || peerId === user.id) {
    alert("لا يمكن الاتصال بهذا الحساب");
    return;
  }

  activeCall = {
    callId: crypto.randomUUID(),
    peerId,
    type,
    incoming: false
  };

  pendingCallCandidates = [];
  callMuted = false;
  cameraDisabled = false;

  try {
    showCallScreen({
      title: type === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
      subtitle: "جاري الاتصال بصديقك...",
      video: type === "video"
    });

    localCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
        ? { facingMode: "user" }
        : false
    });

    callElement("callLocalVideo").srcObject = localCallStream;

    createCallPeer();

    const offer = await callPeer.createOffer();
    await callPeer.setLocalDescription(offer);

    await sendCallSignal("offer", {
      sdp: callPeer.localDescription,
      callType: type,
      callerName: user.user_metadata?.display_name || user.email || "صديقك"
    });

    callElement("callSubtitle").textContent =
      "ننتظر رد الطرف الآخر...";

  } catch (error) {
    console.error("Start call error:", error);
    alert("تعذّر بدء المكالمة: " + error.message);
    await cleanupCall();
  }
}

async function acceptIncomingCall() {
  if (!activeCall || !activeCall.incoming || !activeCall.offer) return;

  const peerId = activeCall.peerId;
  const offer = activeCall.offer;
  const type = activeCall.type;

  try {
    callElement("callSubtitle").textContent =
      "جاري تشغيل الميكروفون والكاميرا...";

    await openChat(peerId);

    if (!conversationId) {
      throw new Error("لم يتم العثور على المحادثة");
    }

    localCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
        ? { facingMode: "user" }
        : false
    });

    callElement("callLocalVideo").srcObject = localCallStream;

    createCallPeer();

    await callPeer.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    for (const candidate of pendingCallCandidates) {
      try {
        await callPeer.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.warn("Pending ICE error:", error);
      }
    }

    pendingCallCandidates = [];

    const answer = await callPeer.createAnswer();
    await callPeer.setLocalDescription(answer);

    await sendCallSignal("answer", {
      sdp: callPeer.localDescription
    });

    activeCall.incoming = false;

    callElement("callIncomingActions")
      .classList.add("call-hidden");

    callElement("callActiveActions")
      .classList.remove("call-hidden");

    callElement("callSubtitle").textContent =
      "تم قبول المكالمة، جاري الاتصال...";

  } catch (error) {
    console.error("Accept call error:", error);
    alert("تعذّر قبول المكالمة: " + error.message);
    await endCall("reject");
  }
}

async function handleCallSignal(row) {
  if (!row || !user || row.sender_id === user.id) return;

  const payload = row.payload || {};
  const callId = payload.callId;

  if (!callId) return;

  if (row.signal_type === "offer") {
    if (activeCall) {
      try {
        await db.from("call_signals").insert({
          conversation_id: row.conversation_id,
          sender_id: user.id,
          recipient_id: row.sender_id,
          signal_type: "busy",
          payload: { callId }
        });
      } catch (error) {
        console.error(error);
      }
      return;
    }

    activeCall = {
      callId,
      peerId: row.sender_id,
      conversationId: row.conversation_id,
      type: payload.callType === "video" ? "video" : "audio",
      incoming: true,
      offer: payload.sdp
    };

    pendingCallCandidates = [];

    showCallScreen({
      title: "مكالمة واردة",
      subtitle:
        (payload.callerName || "صديقك") +
        (activeCall.type === "video"
          ? " يتصل بك فيديو"
          : " يتصل بك صوتياً"),
      incoming: true,
      video: activeCall.type === "video"
    });

    return;
  }

  if (!activeCall || activeCall.callId !== callId) return;

  if (row.signal_type === "answer") {
    if (callPeer && payload.sdp) {
      try {
        await callPeer.setRemoteDescription(
          new RTCSessionDescription(payload.sdp)
        );

        for (const candidate of pendingCallCandidates) {
          await callPeer.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }

        pendingCallCandidates = [];
      } catch (error) {
        console.error("Answer error:", error);
      }
    }
    return;
  }

  if (row.signal_type === "ice") {
    if (!payload.candidate) return;

    if (callPeer?.remoteDescription) {
      try {
        await callPeer.addIceCandidate(
          new RTCIceCandidate(payload.candidate)
        );
      } catch (error) {
        console.warn("ICE candidate error:", error);
      }
    } else {
      pendingCallCandidates.push(payload.candidate);
    }
    return;
  }

  if (row.signal_type === "reject") {
    alert("تم رفض المكالمة");
    await cleanupCall();
    return;
  }

  if (row.signal_type === "busy") {
    alert("الطرف الآخر مشغول حالياً");
    await cleanupCall();
    return;
  }

  if (
    row.signal_type === "hangup" ||
    row.signal_type === "cancel"
  ) {
    alert("انتهت المكالمة");
    await cleanupCall();
  }
}

async function endCall(signalType = "hangup") {
  if (!activeCall) {
    await cleanupCall();
    return;
  }

  const call = activeCall;

  try {
    if (!call.incoming && conversationId) {
      await sendCallSignal(signalType);
    } else if (call.incoming && call.conversationId) {
      await db.from("call_signals").insert({
        conversation_id: call.conversationId,
        sender_id: user.id,
        recipient_id: call.peerId,
        signal_type: signalType,
        payload: { callId: call.callId }
      });
    }
  } catch (error) {
    console.warn("End call signal error:", error);
  }

  await cleanupCall();
}

async function cleanupCall() {
  if (callPeer) {
    callPeer.ontrack = null;
    callPeer.onicecandidate = null;
    callPeer.close();
    callPeer = null;
  }

  if (localCallStream) {
    localCallStream.getTracks().forEach(track => track.stop());
    localCallStream = null;
  }

  if (remoteCallStream) {
    remoteCallStream.getTracks().forEach(track => track.stop());
    remoteCallStream = null;
  }

  const localVideo = callElement("callLocalVideo");
  const remoteVideo = callElement("callRemoteVideo");
  const remoteAudio = callElement("callRemoteAudio");

  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
  if (remoteAudio) remoteAudio.srcObject = null;

  activeCall = null;
  pendingCallCandidates = [];
  callMuted = false;
  cameraDisabled = false;

  hideCallScreen();
}

function toggleCallMute() {
  if (!localCallStream) return;

  callMuted = !callMuted;

  localCallStream.getAudioTracks().forEach(track => {
    track.enabled = !callMuted;
  });

  callElement("callMute").textContent =
    callMuted ? "🔇" : "🎙️";
}

function toggleCallCamera() {
  if (!localCallStream) return;

  const tracks = localCallStream.getVideoTracks();
  if (!tracks.length) return;

  cameraDisabled = !cameraDisabled;

  tracks.forEach(track => {
    track.enabled = !cameraDisabled;
  });

  callElement("callCamera").textContent =
    cameraDisabled ? "🚫" : "📷";
}

async function startCallRealtime() {
  if (!db || !user) return;

  if (callChannel) {
    await db.removeChannel(callChannel);
    callChannel = null;
  }

  callChannel = db
    .channel("shahinaz-call-signals-" + user.id)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
        filter: "recipient_id=eq." + user.id
      },
      event => {
        handleCallSignal(event.new).catch(error => {
          console.error("Call signal handler:", error);
        });
      }
    )
    .subscribe(status => {
      console.log("SHAHINAZ calls:", status);
    });
}

/* =========================================
   INITIALIZATION
========================================= */

function initializeShahinazCalls() {
  callStyles();
  createCallInterface();
  installCallButtons();
  startCallRealtime();

  const observer = new MutationObserver(() => {
    installCallButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeShahinazCalls
  );
} else {
  initializeShahinazCalls();
}
const callInitWatcher = setInterval(() => {
  if (db && user && !callChannel) {
    startCallRealtime();
  }

  if (db && user && callChannel) {
    clearInterval(callInitWatcher);
  }
}, 1000);
