'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestions?: string[];
}

interface WildfireChatbotProps {
  currentRegion?: string;
  currentDate?: string;
}

export function WildfireChatbot({ currentRegion = 'Northern California Pilot', currentDate }: WildfireChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: `👋 Hello! I am the **GeoFusion Wildfire AI Assistant**.\n\nAsk me about current fire risk levels, 14-day weather sequences, model confidence intervals (95% CI), or any of the 7 active monitoring domains!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'How does the multimodal fusion model work?',
        'What do the risk tiers and colors mean?',
        'List all 7 active monitoring regions',
        'How fast are realtime telemetry updates?'
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentRegion,
          currentDate,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const botMsg: MessageItem = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'I could not process your query at this moment.',
        timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: data.suggestions || [],
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg: MessageItem = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: '⚠️ Unable to connect to GeoFusion AI service. Please check your network connection and try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open GeoFusion AI Wildfire Assistant Chatbot"
          className="group flex items-center gap-3 bg-neutral-900/95 hover:bg-neutral-850 text-white px-4 py-3 rounded-2xl border border-amber-500/40 hover:border-amber-400 shadow-2xl shadow-amber-500/20 backdrop-blur-xl transition-all duration-300 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 shadow-md">
            <span className="text-base" aria-hidden="true">🔥</span>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-neutral-900 rounded-full animate-pulse" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-black text-white leading-tight flex items-center gap-1.5">
              <span>GeoFusion AI</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">online</span>
            </p>
            <p className="text-[11px] text-neutral-400 leading-tight mt-0.5 font-mono">Ask about fire risk & models</p>
          </div>
        </button>
      )}

      {/* Chat Window Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GeoFusion Wildfire AI Assistant"
          className="w-[92vw] sm:w-[400px] h-[560px] max-h-[85vh] bg-neutral-900/98 backdrop-blur-2xl border border-neutral-700/90 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-neutral-950/80 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-sm shadow-md">
                🔥
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white leading-tight">GeoFusion AI</h2>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[10px] text-neutral-400 font-mono">Wildfire & Model Assistant</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setMessages([messages[0]])}
                aria-label="Clear chat messages"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 text-xs transition"
                title="Reset conversation"
              >
                🔄
              </button>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close chat window"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 text-sm transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 sm:p-3.5 leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-amber-500 text-neutral-950 font-medium rounded-tr-sm shadow-md shadow-amber-500/10'
                      : 'bg-neutral-950/90 text-neutral-200 border border-neutral-800 rounded-tl-sm shadow-md whitespace-pre-line'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-neutral-400 px-1 mt-1 font-mono">
                  {msg.timestamp}
                </span>

                {/* Suggestions Chips from Assistant */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[95%]">
                    {msg.suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(s)}
                        className="text-[11px] px-2.5 py-1 rounded-xl bg-neutral-800/90 hover:bg-neutral-750 text-amber-300 hover:text-amber-200 border border-neutral-700 hover:border-amber-400/50 transition font-mono text-left"
                      >
                        💡 {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Loading typing bubble */}
            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-neutral-950/90 border border-neutral-800 w-fit">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-[11px] text-neutral-400 font-mono ml-1">Analyzing spatiotemporal telemetry...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-neutral-950/90 border-t border-neutral-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about fire risk, models, regions..."
                disabled={isLoading}
                className="flex-1 bg-neutral-900 border border-neutral-750 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 font-sans transition disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                aria-label="Send message"
                className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 font-bold text-xs transition flex items-center justify-center shadow-md shadow-amber-500/20"
              >
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
