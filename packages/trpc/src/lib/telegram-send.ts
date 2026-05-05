/**
 * Send a text message to a Telegram chat via the Bot API.
 * Logs errors but does not throw — webhook handlers should never fail
 * because of a downstream send failure.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[telegram-send] Failed to send message to chat ${chatId}: HTTP ${res.status} — ${body}`
      );
    }
  } catch (err) {
    console.error(`[telegram-send] Network error sending to chat ${chatId}:`, err);
  }
}
