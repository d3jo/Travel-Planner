import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBaseUrl } from "../api";

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamChars, setStreamChars]   = useState(0);
  const [genError, setGenError]         = useState("");

  const startGeneration = async (payload) => {
    setGenError("");
    setStreamChars(0);
    setIsGenerating(true);
    try {
      const res = await fetch(`${getBaseUrl()}/plan/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer  = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "delta") setStreamChars((n) => n + event.text.length);
          if (event.type === "done") {
            setIsGenerating(false);
            navigate("/plan", { state: { plan: event.result, preferences: payload } });
            return;
          }
        }
      }
    } catch (e) {
      setGenError(e?.message || "Failed to generate trip plan.");
    } finally {
      setIsGenerating(false);
    }
  };

  const clearError = () => setGenError("");

  return (
    <GenerationContext.Provider value={{ isGenerating, streamChars, genError, startGeneration, clearError }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
