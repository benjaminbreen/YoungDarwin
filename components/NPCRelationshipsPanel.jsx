'use client';

import React from 'react';
import { npcs } from '../data/npcs';
import useGameStore from '../hooks/useGameStore';

export default function NPCRelationshipsPanel({ isOpen, onClose, onNPCClick }) {
  const { npcRelationships, getRelationship } = useGameStore();

  if (!isOpen) return null;

  const getTierColor = (tier) => {
    switch (tier) {
      case 'trusted': return 'text-green-700 bg-green-100 border-green-400';
      case 'friendly': return 'text-blue-700 bg-blue-100 border-blue-400';
      case 'neutral': return 'text-yellow-700 bg-yellow-100 border-yellow-400';
      case 'cold': return 'text-orange-700 bg-orange-100 border-orange-400';
      case 'hostile': return 'text-red-700 bg-red-100 border-red-400';
      default: return 'text-gray-700 bg-gray-100 border-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-amber-200 bg-amber-50">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-darwin-dark font-serif">
              NPC Relationships
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
              aria-label="Close relationships panel"
            >
              &times;
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Build relationships through respectful dialogue, sharing specimens, and helping NPCs
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {npcs.map(npc => {
              const relationship = getRelationship(npc.id);
              if (!relationship) return null;

              const tierColor = getTierColor(relationship.tier);

              return (
                <div
                  key={npc.id}
                  onClick={() => onNPCClick && onNPCClick(npc.id)}
                  className="bg-darwin-light border border-amber-300 rounded-lg p-4 shadow-sm hover:shadow-lg transition-all cursor-pointer hover:border-amber-400 hover:scale-[1.02]"
                >
                  {/* NPC Header */}
                  <div className="flex items-start mb-3">
                    <div className="text-4xl mr-3">{relationship.emoji}</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-darwin-dark">{npc.name}</h3>
                      <p className="text-xs text-gray-600 italic">{npc.role}</p>
                    </div>
                    <span className={`
                      px-2 py-1 rounded text-xs font-medium border
                      ${tierColor}
                    `}>
                      {relationship.tier.charAt(0).toUpperCase() + relationship.tier.slice(1)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Relationship</span>
                      <span>{relationship.score}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          relationship.score >= 80 ? 'bg-green-500' :
                          relationship.score >= 60 ? 'bg-blue-500' :
                          relationship.score >= 40 ? 'bg-yellow-500' :
                          relationship.score >= 20 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${relationship.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex justify-between text-xs text-gray-600 mb-3">
                    <span>Interactions: {relationship.interactions}</span>
                    {relationship.lastInteraction && (
                      <span>Last: {new Date(relationship.lastInteraction).toLocaleTimeString()}</span>
                    )}
                  </div>

                  {/* Unlocked Dialogue */}
                  {relationship.unlockedDialogue.length > 0 && (
                    <div className="mt-3 p-2 bg-amber-100 rounded border border-amber-300">
                      <p className="text-xs font-medium text-amber-900 mb-1">🔓 Unlocked:</p>
                      <ul className="text-xs text-amber-800 space-y-0.5">
                        {relationship.unlockedDialogue.map((dialogue, idx) => (
                          <li key={idx} className="flex items-center">
                            <span className="mr-1">•</span>
                            {dialogue === 'trusted_secrets' && 'Trusted Secrets'}
                            {dialogue === 'personal_stories' && 'Personal Stories'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Next Threshold */}
                  {relationship.score < 60 && (
                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs text-blue-800">
                        🎯 {60 - relationship.score} more to unlock personal stories
                      </p>
                    </div>
                  )}
                  {relationship.score >= 60 && relationship.score < 80 && (
                    <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                      <p className="text-xs text-green-800">
                        🎯 {80 - relationship.score} more to unlock trusted secrets
                      </p>
                    </div>
                  )}
                  {relationship.score >= 80 && (
                    <div className="mt-3 p-2 bg-purple-50 rounded border border-purple-200">
                      <p className="text-xs text-purple-800 font-medium">
                        ⭐ Maximum trust achieved!
                      </p>
                    </div>
                  )}

                  {/* Relationship Tips */}
                  <div className="mt-3 text-xs text-gray-600 italic">
                    <p className="font-medium text-gray-700 mb-1">How to improve:</p>
                    <ul className="space-y-0.5 pl-3">
                      <li>• Engage in respectful dialogue</li>
                      <li>• Share specimens and findings</li>
                      <li>• Help with their requests</li>
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Relationship Guide */}
          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-300">
            <h3 className="font-bold text-darwin-dark mb-3">Relationship Guide</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="text-center">
                <div className="text-2xl mb-1">❤️‍🔥</div>
                <p className="font-medium">Hostile</p>
                <p className="text-gray-600">0-19</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">🧡</div>
                <p className="font-medium">Cold</p>
                <p className="text-gray-600">20-39</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">💛</div>
                <p className="font-medium">Neutral</p>
                <p className="text-gray-600">40-59</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">💙</div>
                <p className="font-medium">Friendly</p>
                <p className="text-gray-600">60-79</p>
              </div>
              <div className="text-center">
                <div className="text-2xl mb-1">💚</div>
                <p className="font-medium">Trusted</p>
                <p className="text-gray-600">80-100</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-amber-200 bg-amber-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-darwin-primary text-white rounded-lg hover:bg-darwin-accent transition-colors shadow-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
