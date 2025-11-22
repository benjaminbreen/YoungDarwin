'use client';
import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function NPCModal({ npcId, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const modalRef = useRef(null);
  const { npcRelationships, getRelationship, npcs } = useGameStore();

  // Find the NPC data
  const npc = npcs.find(n => n.id === npcId);
  const relationship = npcId ? getRelationship(npcId) : null;

  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];

      const handleEscKey = (e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscKey);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !npc) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-amber-50 via-white to-amber-50/50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border-2 border-amber-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-modal-title"
      >
        {/* Header with Portrait */}
        <div className="relative bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-b-2 border-amber-300 p-6">
          <div className="flex items-start gap-6">
            {/* Portrait */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 rounded-xl overflow-hidden border-4 border-amber-300 shadow-lg bg-gradient-to-br from-amber-100 to-amber-200">
                <img
                  src={npc.portrait || '/default-npc.jpg'}
                  alt={npc.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = `<div class="w-full h-full flex items-center justify-center text-5xl">${npc.name.charAt(0)}</div>`;
                  }}
                />
              </div>
            </div>

            {/* Name and Title */}
            <div className="flex-1">
              <h2 id="npc-modal-title" className="text-4xl font-bold text-amber-900 font-serif mb-2 drop-shadow-sm">
                {npc.name}
              </h2>
              <p className="text-xl text-amber-700 italic font-serif mb-3">{npc.role}</p>

              {/* Relationship Status */}
              {relationship && (
                <div className="mt-4 bg-white/60 rounded-lg p-3 border border-amber-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-amber-800">Relationship</span>
                    <span className="text-2xl">{relationship.emoji}</span>
                  </div>
                  <div className="relative h-3 bg-amber-100 rounded-full overflow-hidden border border-amber-300">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                        relationship.tier === 'hostile' ? 'bg-gradient-to-r from-red-500 to-red-600' :
                        relationship.tier === 'cold' ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                        relationship.tier === 'neutral' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                        relationship.tier === 'friendly' ? 'bg-gradient-to-r from-blue-400 to-blue-500' :
                        'bg-gradient-to-r from-green-500 to-green-600'
                      }`}
                      style={{ width: `${relationship.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs font-medium text-amber-700 capitalize">{relationship.tier}</span>
                    <span className="text-xs text-amber-600">{relationship.score}/100</span>
                  </div>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-amber-200 hover:bg-amber-300 text-amber-900 text-3xl font-bold transition-all hover:scale-110 shadow-md hover:shadow-lg border-2 border-amber-400"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b-2 border-amber-200 bg-gradient-to-r from-amber-50 via-white to-amber-50">
          <button
            className={`flex-1 px-6 py-4 font-serif font-semibold text-base transition-all relative ${
              activeTab === 'overview'
                ? 'bg-white text-amber-900 shadow-sm'
                : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            <span className="relative z-10">📋 Overview</span>
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
            )}
          </button>
          <button
            className={`flex-1 px-6 py-4 font-serif font-semibold text-base transition-all relative ${
              activeTab === 'history'
                ? 'bg-white text-amber-900 shadow-sm'
                : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <span className="relative z-10">💬 Conversation History</span>
            {activeTab === 'history' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
            )}
          </button>
          <button
            className={`flex-1 px-6 py-4 font-serif font-semibold text-base transition-all relative ${
              activeTab === 'context'
                ? 'bg-white text-amber-900 shadow-sm'
                : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
            }`}
            onClick={() => setActiveTab('context')}
          >
            <span className="relative z-10">📜 Historical Context</span>
            {activeTab === 'context' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-white via-amber-50/10 to-amber-50/30">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Short Description */}
              <section className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-5 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-3 border-l-4 border-amber-400 pl-3 font-serif">
                  At a Glance
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed italic text-lg">
                  "{npc.shortDescription}"
                </p>
              </section>

              {/* Appearance */}
              <section className="bg-gradient-to-br from-amber-50/30 to-white rounded-xl p-5 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-3 border-l-4 border-amber-400 pl-3 font-serif">
                  Appearance
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed">
                  {npc.appearance}
                </p>
              </section>

              {/* Personality */}
              <section className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-5 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-3 border-l-4 border-amber-400 pl-3 font-serif">
                  Personality
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed">
                  {npc.personality}
                </p>
              </section>

              {/* Game Role */}
              {npc.gameRole && (
                <section className="bg-gradient-to-br from-amber-100/40 to-amber-50/30 rounded-xl p-5 border border-amber-300 shadow-md">
                  <h3 className="text-lg font-bold text-amber-900 mb-3 border-l-4 border-amber-500 pl-3 font-serif">
                    Role in Your Journey
                  </h3>
                  <p className="text-gray-700 font-serif leading-relaxed">
                    {npc.gameRole}
                  </p>
                </section>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-6 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  Interaction Summary
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200">
                    <div className="text-3xl font-bold text-amber-900">{relationship?.interactions || 0}</div>
                    <div className="text-sm text-amber-700 font-serif">Total Conversations</div>
                  </div>
                  <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200">
                    <div className="text-3xl font-bold text-amber-900">
                      {relationship?.lastInteraction ? 'Day ' + Math.floor(relationship.lastInteraction / 1440) : 'Never'}
                    </div>
                    <div className="text-sm text-amber-700 font-serif">Last Interaction</div>
                  </div>
                </div>

                {relationship?.unlockedDialogue?.length > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200 shadow-sm">
                    <h4 className="text-sm font-bold text-green-900 mb-2">🔓 Unlocked Content</h4>
                    <ul className="text-sm text-green-800 space-y-1 font-serif">
                      {relationship.unlockedDialogue.map((unlock, i) => (
                        <li key={i} className="capitalize">• {unlock.replace(/_/g, ' ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sample Dialogue */}
              {npc.dialogueExamples && npc.dialogueExamples.length > 0 && (
                <div className="bg-gradient-to-br from-amber-50/60 to-amber-100/30 rounded-xl p-6 border border-amber-300 shadow-md">
                  <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-500 pl-3 font-serif">
                    Characteristic Speech
                  </h3>
                  <div className="space-y-3">
                    {npc.dialogueExamples.map((example, i) => (
                      <div key={i} className="bg-white/70 rounded-lg p-4 border border-amber-200 shadow-sm">
                        <p className="text-gray-700 font-serif italic leading-relaxed">
                          "{example}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'context' && (
            <div className="space-y-6">
              {/* Background */}
              <section className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-6 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  Historical Background
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed text-base">
                  {npc.background}
                </p>
              </section>

              {/* Initial Reaction */}
              {npc.initialReaction && (
                <section className="bg-gradient-to-br from-amber-50/50 to-amber-100/30 rounded-xl p-6 border border-amber-300 shadow-md">
                  <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-500 pl-3 font-serif">
                    First Impressions of Darwin
                  </h3>
                  <p className="text-gray-700 font-serif leading-relaxed italic text-base">
                    {npc.initialReaction}
                  </p>
                </section>
              )}

              {/* Historical Note */}
              <section className="bg-gradient-to-br from-blue-50/40 to-indigo-50/30 rounded-xl p-5 border-2 border-blue-200 shadow-md">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">📖</span>
                  <div>
                    <h4 className="text-sm font-bold text-blue-900 mb-2 font-serif">Historical Note</h4>
                    <p className="text-sm text-blue-800 font-serif leading-relaxed">
                      This character represents the types of individuals Darwin encountered during his voyage.
                      Their portrayal is based on historical records and primary sources from the 1835 expedition.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 rounded-lg text-white font-serif font-semibold transition-all shadow-md hover:shadow-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
