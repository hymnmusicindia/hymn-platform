"use client";

import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "+918793643228";
const WHATSAPP_MESSAGE = "Hi! I'm interested in learning more about HYMN's services.";

export function WhatsAppContactButton() {
  const handleWhatsAppClick = () => {
    const encodedMessage = encodeURIComponent(WHATSAPP_MESSAGE);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodedMessage}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <button
      onClick={handleWhatsAppClick}
      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-all hover:bg-green-700 active:scale-95"
      title="Contact us on WhatsApp"
    >
      <MessageCircle className="h-5 w-5" />
      <span>WhatsApp</span>
    </button>
  );
}

export function WhatsAppContactLink() {
  const encodedMessage = encodeURIComponent(WHATSAPP_MESSAGE);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodedMessage}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-green-600 transition-colors hover:text-green-700"
    >
      <MessageCircle className="h-5 w-5" />
      <span>{WHATSAPP_NUMBER}</span>
    </a>
  );
}

// trigger vercel deploy
