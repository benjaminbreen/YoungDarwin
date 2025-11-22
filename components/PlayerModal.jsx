'use client';
import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../hooks/useGameStore';

export default function PlayerModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const modalRef = useRef(null);
  const { inventory, fatigue, darwinMood, daysPassed, gameTime } = useGameStore();

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

  if (!isOpen) return null;

  const formatGameTime = () => {
    const totalMinutes = gameTime % 1440;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-gradient-to-br from-amber-50 via-white to-amber-50/50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border-2 border-amber-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
      >
        {/* Header with Portrait */}
        <div className="relative bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-b-2 border-amber-300 p-6">
          <div className="flex items-start gap-6">
            {/* Portrait */}
            <div className="flex-shrink-0">
              <div className="w-32 h-32 rounded-xl overflow-hidden border-4 border-amber-400 shadow-lg bg-gradient-to-br from-amber-100 to-amber-200">
                <img
                  src="/portraits/darwin.jpg"
                  alt="Charles Darwin"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-5xl">🧑‍🔬</div>';
                  }}
                />
              </div>
            </div>

            {/* Name and Title */}
            <div className="flex-1">
              <h2 id="player-modal-title" className="text-4xl font-bold text-amber-900 font-serif mb-2 drop-shadow-sm">
                Charles Darwin
              </h2>
              <p className="text-xl text-amber-700 italic font-serif mb-3">Naturalist aboard HMS Beagle</p>

              {/* Status Overview */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-white/60 rounded-lg p-3 border border-amber-200 shadow-sm">
                  <div className="text-xs text-amber-700 font-semibold mb-1">Day</div>
                  <div className="text-2xl font-bold text-amber-900">{daysPassed}</div>
                </div>
                <div className="bg-white/60 rounded-lg p-3 border border-amber-200 shadow-sm">
                  <div className="text-xs text-amber-700 font-semibold mb-1">Time</div>
                  <div className="text-2xl font-bold text-amber-900">{formatGameTime()}</div>
                </div>
              </div>
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
              activeTab === 'inventory'
                ? 'bg-white text-amber-900 shadow-sm'
                : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
            }`}
            onClick={() => setActiveTab('inventory')}
          >
            <span className="relative z-10">🎒 Specimens Collected</span>
            {activeTab === 'inventory' && (
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
              {/* Current Status */}
              <section className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-5 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  Current Status
                </h3>
                <div className="space-y-4">
                  {/* Fatigue */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-amber-800">Physical Condition</span>
                      <span className="text-sm text-amber-700">{fatigue}/100 fatigue</span>
                    </div>
                    <div className="relative h-4 bg-amber-100 rounded-full overflow-hidden border border-amber-300">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                          fatigue < 50 ? 'bg-gradient-to-r from-green-400 to-green-500' :
                          fatigue < 75 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                          fatigue < 90 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                          'bg-gradient-to-r from-red-500 to-red-600'
                        }`}
                        style={{ width: `${fatigue}%` }}
                      />
                    </div>
                  </div>

                  {/* Mood */}
                  <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200">
                    <div className="text-sm font-semibold text-amber-800 mb-1">Mental State</div>
                    <div className="text-lg font-serif text-gray-700 italic">{darwinMood}</div>
                  </div>
                </div>
              </section>

              {/* Progress */}
              <section className="bg-gradient-to-br from-amber-50/30 to-white rounded-xl p-5 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  Journey Progress
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/70 rounded-lg p-4 border border-amber-200 text-center">
                    <div className="text-3xl font-bold text-amber-900">{daysPassed}</div>
                    <div className="text-sm text-amber-700 font-serif mt-1">Days on Floreana</div>
                  </div>
                  <div className="bg-white/70 rounded-lg p-4 border border-amber-200 text-center">
                    <div className="text-3xl font-bold text-amber-900">{inventory.length}</div>
                    <div className="text-sm text-amber-700 font-serif mt-1">Specimens Collected</div>
                  </div>
                </div>
              </section>

              {/* Bio */}
              <section className="bg-gradient-to-br from-blue-50/40 to-indigo-50/30 rounded-xl p-5 border-2 border-blue-200 shadow-md">
                <h3 className="text-lg font-bold text-blue-900 mb-3 border-l-4 border-blue-400 pl-3 font-serif">
                  About You
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed text-base">
                  You are Charles Darwin, a young naturalist at the age of 26, serving aboard HMS Beagle.
                  Though you initially trained for the clergy, your passion for natural history has led you
                  to this extraordinary voyage around the world. Your keen observations and meticulous
                  note-taking will, in time, revolutionize our understanding of life on Earth.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-6 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  Collected Specimens ({inventory.length})
                </h3>
                {inventory.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-5xl mb-3">🔍</div>
                    <p className="text-gray-600 font-serif italic">
                      No specimens collected yet. Begin your exploration!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {inventory.map((item, index) => (
                      <div
                        key={index}
                        className="bg-gradient-to-br from-white to-amber-50/30 rounded-lg p-4 border border-amber-200 shadow-sm hover:shadow-md transition-all hover:border-amber-300"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-3xl">{item.icon || '📦'}</div>
                          <div className="flex-1">
                            <h4 className="font-bold text-amber-900 font-serif mb-1">{item.name}</h4>
                            {item.description && (
                              <p className="text-sm text-gray-600 font-serif">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'context' && (
            <div className="space-y-6">
              {/* Historical Background */}
              <section className="bg-gradient-to-br from-white to-amber-50/40 rounded-xl p-6 border border-amber-200 shadow-sm">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-400 pl-3 font-serif">
                  The Beagle Voyage
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed text-base mb-4">
                  In December 1831, you departed England aboard HMS Beagle as the ship's naturalist and companion
                  to Captain Robert FitzRoy. The voyage was planned to last two years but will ultimately extend
                  to nearly five, circumnavigating the globe and visiting South America, the Galápagos Islands,
                  Australia, and many other exotic locations.
                </p>
                <p className="text-gray-700 font-serif leading-relaxed text-base">
                  Your observations during this journey—particularly in the Galápagos—will eventually lead to
                  your groundbreaking theory of evolution by natural selection, though this realization will
                  take many years to fully develop.
                </p>
              </section>

              {/* The Galápagos */}
              <section className="bg-gradient-to-br from-amber-50/50 to-amber-100/30 rounded-xl p-6 border border-amber-300 shadow-md">
                <h3 className="text-lg font-bold text-amber-900 mb-4 border-l-4 border-amber-500 pl-3 font-serif">
                  Isla Floreana, 1835
                </h3>
                <p className="text-gray-700 font-serif leading-relaxed text-base mb-4">
                  You have arrived at the Galápagos archipelago in September 1835. These volcanic islands,
                  located about 600 miles off the coast of Ecuador, are home to unique flora and fauna found
                  nowhere else on Earth.
                </p>
                <p className="text-gray-700 font-serif leading-relaxed text-base">
                  Isla Floreana (also called Charles Island) is one of the few inhabited islands, featuring
                  a small settlement and a penal colony. Here you will encounter giant tortoises, unusual
                  mockingbirds, and many other fascinating species that vary slightly from those on other islands.
                </p>
              </section>

              {/* Scientific Context */}
              <section className="bg-gradient-to-br from-blue-50/40 to-indigo-50/30 rounded-xl p-5 border-2 border-blue-200 shadow-md">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">🔬</span>
                  <div>
                    <h4 className="text-sm font-bold text-blue-900 mb-2 font-serif">Scientific Context</h4>
                    <p className="text-sm text-blue-800 font-serif leading-relaxed">
                      In 1835, the prevailing scientific view holds that species are immutable—created in their
                      present forms and unchanging over time. Your careful observations and specimen collection
                      during this voyage will eventually challenge this orthodoxy, though you won't publish your
                      theory until 1859 in "On the Origin of Species."
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
