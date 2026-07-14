import { Phone, Copy, MessageCircle } from "lucide-react";
import { Button } from "./button";
import { toast } from "sonner";

interface ContactActionsProps {
  mobile: string;
}

export function ContactActions({ mobile }: ContactActionsProps) {
  if (!mobile) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(mobile);
    toast.success("Mobile number copied!");
  };

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${mobile}`;
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Assuming Indian format (+91) if not provided, for typical use cases, 
    // but just appending directly is usually safe if they format it correctly.
    // If we want to be safe, we can strip non-digits.
    const cleanMobile = mobile.replace(/\D/g, '');
    const waNumber = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;
    window.open(`https://wa.me/${waNumber}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        variant="outline"
        size="icon"
        className="h-6 w-6 rounded-full bg-background"
        onClick={handleCall}
        title="Call"
      >
        <Phone className="h-3 w-3 text-blue-600" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-6 w-6 rounded-full bg-background"
        onClick={handleWhatsApp}
        title="WhatsApp"
      >
        <MessageCircle className="h-3 w-3 text-green-600" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-6 w-6 rounded-full bg-background"
        onClick={handleCopy}
        title="Copy"
      >
        <Copy className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}
