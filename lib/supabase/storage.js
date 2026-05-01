const DEFAULT_IMAGE_BUCKET = "chat-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

function getCryptoUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `image_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sanitizeFileName(name) {
  return String(name || "image")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function getAttachmentUrl(attachment) {
  return attachment?.dataUrl || attachment?.signedUrl || attachment?.publicUrl || attachment?.url || "";
}

function dataUrlToArrayBuffer(dataUrl) {
  const matched = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!matched) {
    return null;
  }

  const mimeType = matched[1];
  const base64 = matched[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    mimeType,
    buffer: bytes,
  };
}

function getBucketName(attachment) {
  return attachment?.bucket || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || DEFAULT_IMAGE_BUCKET;
}

async function createAttachmentSignedUrl(supabase, attachment) {
  const storagePath = attachment?.storagePath;
  if (!storagePath) {
    return attachment;
  }

  const bucket = getBucketName(attachment);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    return attachment;
  }

  return {
    ...attachment,
    bucket,
    signedUrl: data.signedUrl,
    url: data.signedUrl,
  };
}

export async function uploadImageAttachment(supabase, userId, attachment) {
  if (!attachment || attachment.type !== "image") {
    return attachment;
  }

  if (attachment.storagePath) {
    return createAttachmentSignedUrl(supabase, attachment);
  }

  const resolvedUrl = getAttachmentUrl(attachment);
  if (!resolvedUrl.startsWith("data:")) {
    return attachment;
  }

  const parsed = dataUrlToArrayBuffer(resolvedUrl);
  if (!parsed) {
    return attachment;
  }

  const bucket = getBucketName(attachment);
  const ext = parsed.mimeType.split("/")[1] || "png";
  const fileName = sanitizeFileName(attachment.name || `upload.${ext}`);
  const storagePath = `${userId}/${new Date().toISOString().slice(0, 10)}/${getCryptoUuid()}-${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, parsed.buffer, {
    contentType: attachment.mimeType || parsed.mimeType,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return createAttachmentSignedUrl(supabase, {
    ...attachment,
    bucket,
    mimeType: attachment.mimeType || parsed.mimeType,
    storagePath,
  });
}

export async function hydrateMessageAttachments(supabase, userId, messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }

  const nextMessages = [];

  for (const message of messages) {
    if (!Array.isArray(message.attachments) || !message.attachments.length) {
      nextMessages.push(message);
      continue;
    }

    const attachments = [];
    for (const attachment of message.attachments) {
      attachments.push(await uploadImageAttachment(supabase, userId, attachment));
    }

    nextMessages.push({
      ...message,
      attachments,
    });
  }

  return nextMessages;
}

export async function resolveMessageAttachments(supabase, messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }

  const nextMessages = [];

  for (const message of messages) {
    if (!Array.isArray(message.attachments) || !message.attachments.length) {
      nextMessages.push(message);
      continue;
    }

    const attachments = [];
    for (const attachment of message.attachments) {
      attachments.push(await createAttachmentSignedUrl(supabase, attachment));
    }

    nextMessages.push({
      ...message,
      attachments,
    });
  }

  return nextMessages;
}

export function serializeAttachmentsForDatabase(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return [];
  }

  return attachments
    .filter((attachment) => attachment?.type === "image")
    .map((attachment) => ({
      id: attachment.id || getCryptoUuid(),
      type: "image",
      name: attachment.name || "image",
      mimeType: attachment.mimeType || "image/png",
      bucket: getBucketName(attachment),
      storagePath: attachment.storagePath || "",
      url: attachment.url || attachment.signedUrl || attachment.publicUrl || "",
    }))
    .filter((attachment) => attachment.storagePath || attachment.url);
}
