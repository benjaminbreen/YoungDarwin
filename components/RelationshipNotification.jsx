'use client';

import React, { useEffect } from 'react';
import { npcs } from '../data/npcs';

export default function RelationshipNotification({ notification, onClose }) {
  useEffect(() => {
    if (notification) {
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, onClose]);

  if (!notification) return null;

  const npc = npcs.find(n => n.id === notification.npcId);
  if (!npc) return null;

  const isPositive = notification.change > 0;
  const tierLabels = {
    trusted: 'Trusted Friend',
    friendly: 'Friendly',
    neutral: 'Neutral',
    cold: 'Cold',
    hostile: 'Hostile'
  };

  return (
    <div className="fixed top-24 right-4 z-50 animate-slide-in-right">
      <div className={`
        max-w-sm p-4 rounded-lg shadow-xl border-2 transition-all
        ${isPositive
          ? 'bg-green-50 border-green-400'
          : 'bg-red-50 border-red-400'}
      `}>
        <div className="flex items-start">
          <div className="flex-shrink-0 mr-3">
            {isPositive ? (
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center mb-1">
              <h4 className="font-bold text-gray-900 text-sm">
                {npc.name}
              </h4>
              <span className="ml-2 text-lg">
                {notification.newScore >= 80 ? '💚' :
                 notification.newScore >= 60 ? '💙' :
                 notification.newScore >= 40 ? '💛' :
                 notification.newScore >= 20 ? '🧡' : '❤️‍🔥'}
              </span>
            </div>

            <p className={`text-sm mb-2 ${isPositive ? 'text-green-800' : 'text-red-800'}`}>
              {isPositive ? '+' : ''}{notification.change} relationship
            </p>

            <p className="text-xs text-gray-700 italic mb-2">
              "{notification.reason}"
            </p>

            {notification.tierChanged && (
              <div className="mt-2 p-2 bg-white bg-opacity-50 rounded border border-amber-300">
                <p className="text-xs font-medium text-amber-900">
                  ✨ Now {tierLabels[notification.newTier]}!
                </p>
              </div>
            )}

            {/* Show unlocked dialogue hint */}
            {notification.newScore >= 80 && notification.tierChanged && (
              <div className="mt-2 p-2 bg-amber-100 rounded border border-amber-400">
                <p className="text-xs font-medium text-amber-900">
                  🔓 {npc.name} may share secrets with you now
                </p>
              </div>
            )}
            {notification.newScore >= 60 && notification.newScore < 80 && notification.tierChanged && (
              <div className="mt-2 p-2 bg-blue-100 rounded border border-blue-400">
                <p className="text-xs font-medium text-blue-900">
                  🗣️ {npc.name} is more open to conversation
                </p>
              </div>
            )}

            {/* Relationship progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Relationship</span>
                <span>{notification.newScore}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    notification.newScore >= 80 ? 'bg-green-500' :
                    notification.newScore >= 60 ? 'bg-blue-500' :
                    notification.newScore >= 40 ? 'bg-yellow-500' :
                    notification.newScore >= 20 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${notification.newScore}%` }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600"
            aria-label="Close notification"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
