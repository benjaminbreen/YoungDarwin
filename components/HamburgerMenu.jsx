import React, { useState, useEffect, useRef } from 'react';

// About Page content component
const AboutPage = () => {
  return (
  <div className="darwin-panel h-full  p-6 bg-amber-50 rounded-lg border border-amber-300 shadow-lg">
      <h2 className="text-3xl font-bold text-amber-900 font-serif p-2 mb-4 border-b border-amber-300 pb-3 text-center">
        About Young Darwin
      </h2>
      <section className="mb-8 bg-amber-100/50 p-6 rounded-lg border border-amber-200">
        <p className="text-gray-700 font-serif mb-4 leading-relaxed text-lg">
          <b><em>Young Darwin</em> is an educational simulation game set in 1835, on Isla Floreana (Charles Island) in the Galápagos Islands. This is a very early prototype version. </b> Players take on the role of a young Charles Darwin, exploring diverse habitats, collecting and analyzing specimens, and reflecting in their journals about the species and other artifacts they discover.
        </p>
        <p className="text-gray-700 font-serif mb-3 leading-relaxed text-lg">
          Unlike traditional educational games, <em>Young Darwin</em> uses multiple Large Language Models (LLMs) to dynamically respond to (and, in future versions, qualitatively assess) students' historical reasoning and analytical writing. There are 7 different LLM agents under the hood, including one dedicated entirely to simulating the subjectivity of the nearest tortoise to you at any given time (that one is hidden - try poking around to find it). Each of these AI agents performs a different function, and each has been provided with ground truth in the form of excerpts from real historical primary sources. This is a key aspect of the HistoryLens framework, since students read the same sources in class, then effectively "speak" to them in a play-based learning environment. 
        </p>

<p className="text-gray-700 font-serif mb-3 leading-relaxed text-lg">
          Players "win" by demonstrating authentic scientific observation and thoughtful reflection consistent with Darwin's own intellectual context in 1835. The primary LLM used here is GPT-4o-mini, though we intend to eventually provide the option of switching between different AI models.
        </p>

      </section>
      <section className="mb-8 p-1">
        <h3 className="text-xl font-medium text-amber-800 mb-3">Why This Game?</h3>
        <p className="text-gray-700 font-serif mb-4 leading-relaxed px-2">
          This game was created by <a href="https://benjaminpbreen.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">Benjamin Breen</a>, Associate Professor of History at <a href="https://ucsc.edu" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">UC Santa Cruz</a>, in association with Professor of Linguistics Pranav Anand and Associate Professor of Literature Zac Zimmer. It was mostly coded by Claude Sonnet 3.7. <em>Young Darwin</em> emerged from experiments with using AI-driven simulations to enrich historical pedagogy. By placing students directly in Darwin's shoes, the game encourages them to engage deeply with primary sources, critique generative AI outputs, and develop "experiential historical reasoning" abilities by asking them to think through what they would do if they were in the shoes of historical figures, then respond to the results dynamically, in real time.
        </p>
      </section>
      <section className="mb-8 bg-amber-100/20 p-5 rounded-lg border border-amber-100">
        <h3 className="text-xl font-medium text-amber-800 mb-3">The HistoryLens Framework</h3>
        <p className="text-gray-700 font-serif mb-3 leading-relaxed px-2">
          This game is part of the larger <a href="https://historylens.org" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">HistoryLens framework</a>, which uses generative AI to simulate historical environments, enabling dynamic, text-based interactions informed by rigorous historical research. HistoryLens scenarios empower students to practice critical thinking by directly interacting with complex historical issues and sources.
        </p>
      </section>
      <section className="mb-8">
        <h3 className="text-xl font-medium text-amber-800 mb-3">The THINK Project at UCSC</h3>
        <p className="text-gray-700 font-serif mb-3 leading-relaxed px-2">
          <em>Young Darwin</em> is an early prototype of a platform and format that will be developed further as part of the THINK (Technology + Humanities Integrated Knowledge) initiative at <a href="https://ucsc.edu" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">UC Santa Cruz</a>, which was funded by the <a href="https://www.neh.gov/" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">National Endowment for the Humanities</a> (NEH) via a Humanities Initiatives grant in February, 2025. THINK explores innovative ways to integrate AI and humanistic methodologies in higher education, emphasizing experiential learning and interdisciplinary collaboration.
        </p>
      </section>
      <section className="border-t border-amber-300 pt-4 mt-8">
        <p className="text-sm text-gray-500 italic text-center">
          &copy; 2025 <a href="https://benjaminpbreen.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">Benjamin Breen</a> (<a href="https://ucsc.edu" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">UC Santa Cruz</a>) – <a href="https://historylens.org" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">HistoryLens Project</a>
        </p>
      </section>
    </div>
  );
};

// Learn More component with enhanced reading suggestions
const LearnMore = () => {
  return (
    <div className="darwin-panel  max-w-3xl mx-auto p-6 bg-amber-50 rounded-lg border border-amber-300 shadow-lg overflow-y-auto">
      <h2 className="text-3xl font-bold text-amber-900 font-serif mb-4 border-b border-amber-300 pb-3 text-center">
        Learn More
      </h2>
      <section className="mb-8 p-5 bg-amber-100/30 rounded-lg border border-amber-200">
        <h3 className="text-xl font-medium text-amber-800 mb-3">Darwin's Voyage</h3>
        <p className="text-gray-700 font-serif mb-4 leading-relaxed">
          In 1835, Charles Darwin visited the Galápagos Islands as the naturalist aboard HMS Beagle. His observations of the unique wildlife, particularly the variations between islands, would later influence his theory of evolution by natural selection.
        </p>
        <p className="text-gray-700 font-serif mb-3 leading-relaxed">
          The variety of finches, mockingbirds, and tortoises on different islands prompted Darwin to question the immutability of species, though he didn't immediately recognize the significance of these variations during his five-week stay.
        </p>
      </section>
      
      <section className="mb-8">
        <h3 className="text-xl font-medium text-amber-800 mb-4 px-2">Further Reading</h3>
        <div className="space-y-5">
          <div className="bg-white rounded-lg p-5 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="font-bold text-amber-900 mb-2">On Darwin and Natural History</h4>
            <ul className="list-disc pl-6 space-y-3 text-gray-700 font-serif mt-3">
              <li>Browne, Janet. <em>Charles Darwin: Voyaging</em> (Princeton University Press, 1995) - Definitive biography covering Darwin's early life and the Beagle voyage.</li>
              <li>Sulloway, Frank J. "Darwin's Conversion: The Beagle Voyage and Its Aftermath," <em>Journal of the History of Biology</em> 15.3 (1982): 325-396.</li>
              <li>Sloan, Phillip. "The Gaze of Natural History," in <em>Inventing Human Science</em>, eds. Fox, Porter, and Wokler (University of California Press, 1995).</li>
              <li>Browne, Janet. "Darwin in Caricature: A Study in the Popularization and Dissemination of Evolution," <em>Proceedings of the American Philosophical Society</em> 145.4 (2001): 496-509.</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-lg p-5 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="font-bold text-amber-900 mb-2">19th Century Scientific Collecting and Practice</h4>
            <ul className="list-disc pl-6 space-y-3 text-gray-700 font-serif mt-3">
              <li>Endersby, Jim. <em>Imperial Nature: Joseph Hooker and the Practices of Victorian Science</em> (University of Chicago Press, 2008).</li>
              <li>Secord, James A. <em>Victorian Sensation: The Extraordinary Publication, Reception, and Secret Authorship of Vestiges of the Natural History of Creation</em> (University of Chicago Press, 2000).</li>
              <li>Nyhart, Lynn K. "Natural History and the 'New' Biology," in <em>Cultures of Natural History</em>, eds. Jardine, Secord, and Spary (Cambridge University Press, 1996): 426-443.</li>
              <li>Larsen, Anne. "Equipment for the Field," in <em>Cultures of Natural History</em>, eds. Jardine, Secord, and Spary (Cambridge University Press, 1996): 358-377.</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-lg p-5 border border-amber-200 shadow-sm hover:shadow-md transition-shadow">
            <h4 className="font-bold text-amber-900 mb-2">Colonial Science and Exploration</h4>
            <ul className="list-disc pl-6 space-y-3 text-gray-700 font-serif mt-3">
              <li>Sivasundaram, Sujit. <em>Nature and the Godly Empire: Science and Evangelical Mission in the Pacific, 1795-1850</em> (Cambridge University Press, 2005).</li>
              <li>Safier, Neil. <em>Measuring the New World: Enlightenment Science and South America</em> (University of Chicago Press, 2008).</li>
              <li>Livingstone, David N. <em>Putting Science in Its Place: Geographies of Scientific Knowledge</em> (University of Chicago Press, 2003).</li>
              <li>Fan, Fa-ti. <em>British Naturalists in Qing China: Science, Empire, and Cultural Encounter</em> (Harvard University Press, 2004).</li>
            </ul>
          </div>
        </div>
      </section>
      
      <section className="mb-8 bg-amber-100/30 p-5 rounded-lg border border-amber-200">
        <h3 className="text-xl font-medium text-amber-800 mb-3">Historical Resources</h3>
        <ul className="list-disc pl-6 space-y-3 text-gray-700 font-serif">
          <li><a href="https://darwin-online.org.uk/" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">Darwin Online</a> - Complete works, manuscripts, and primary sources</li>
          <li><a href="https://www.darwinproject.ac.uk/" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">Darwin Correspondence Project</a> - Letters and correspondence</li>
          <li><a href="https://darwinfoundation.org/" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">Charles Darwin Foundation</a> - Research and conservation in Galápagos</li>
          <li><a href="https://www.nhm.ac.uk/our-science/departments-and-staff/library-and-archives/digital-collections/darwin-manuscripts.html" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline font-medium">Natural History Museum Darwin Manuscripts</a> - Digital collection of Darwin's scientific notes</li>
        </ul>
      </section>
      
      <section className="mb-6 p-5 rounded-lg border border-amber-100">
        <h3 className="text-xl font-medium text-amber-800 mb-3">Educational Applications</h3>
        <p className="text-gray-700 font-serif mb-4 leading-relaxed">
          This simulation can be used as an engaging supplement to traditional biology and history curricula, encouraging students to:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 font-serif">
          <li>Practice scientific observation and documentation</li>
          <li>Understand the historical context of scientific discoveries</li>
          <li>Develop critical thinking about the process of scientific inquiry</li>
          <li>Reflect on how observations lead to theory development</li>
          <li>Appreciate the interdisciplinary nature of historical scientific work</li>
        </ul>
      </section>
      
      <section className="border-t border-amber-300 pt-4 mt-8">
        <p className="text-sm text-gray-500 italic text-center">
          &copy; 2025 <a href="https://benjaminpbreen.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">Benjamin Breen</a> (<a href="https://ucsc.edu" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">UC Santa Cruz</a>) – <a href="https://historylens.org" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">HistoryLens Project</a>
        </p>
      </section>
    </div>
  );
};

// Share component with enhanced functionality
const Share = () => {
  const [copySuccess, setCopySuccess] = useState('');
  const gameUrl = "https://young-darwin.vercel.app";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(gameUrl)
      .then(() => {
        setCopySuccess('✓ Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(() => {
        setCopySuccess('Failed to copy');
        setTimeout(() => setCopySuccess(''), 2000);
      });
  };

  const shareOnSocial = (platform) => {
    let shareUrl;
    const text = "Explore the Galápagos Islands as young Charles Darwin in this educational history simulation game!";
    
    switch(platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(gameUrl)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(gameUrl)}&quote=${encodeURIComponent(text)}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(gameUrl)}`;
        break;
      default:
        return;
    }
    
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Young Darwin',
          text: 'Explore the Galápagos Islands as young Charles Darwin in this educational history simulation game!',
          url: gameUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="darwin-panel max-w-3xl mx-auto p-6 bg-amber-50 rounded-lg border border-amber-300 shadow-lg overflow-y-auto">
      <h2 className="text-3xl font-bold text-amber-900 font-serif mb-5 border-b border-amber-300 pb-3 text-center">
        Share Young Darwin
      </h2>
      <section className="mb-6 px-3">
        <p className="text-gray-700 font-serif mb-4 leading-relaxed text-lg">
          Thank you for your interest in sharing this educational simulation! You can share Young Darwin with your students, colleagues, or friends using the following methods:
        </p>
      </section>
      
      <section className="mb-8 px-3">
        <h3 className="text-xl font-medium text-amber-800 mb-4">Share via Link</h3>
        <div className="flex items-center bg-white rounded-lg border border-amber-200 p-3 shadow-sm">
          <input 
            type="text" 
            value={gameUrl}
            readOnly 
            className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 p-2 font-medium"
          />
          <button 
            className={`ml-2 px-5 py-3 rounded-lg transition-colors relative ${
              copySuccess ? 'bg-green-600 text-white font-medium' : 'bg-amber-600 hover:bg-amber-700 text-white font-medium'
            }`}
            onClick={handleCopyLink}
          >
            {copySuccess || 'Copy Link'}
          </button>
        </div>
      </section>
      
      <section className="mb-10 px-3">
        <h3 className="text-xl font-medium text-amber-800 mb-4">Share on Social Media</h3>
        <div className="space-y-4 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4 justify-center">
          <button 
            onClick={() => shareOnSocial('facebook')}
            className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-7 py-3 rounded-lg transition-all hover:scale-105 shadow-sm font-medium"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z" />
            </svg>
            <span>Facebook</span>
          </button>
          
          <button 
            onClick={() => shareOnSocial('twitter')}
            className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-400 hover:bg-blue-500 text-white px-7 py-3 rounded-lg transition-all hover:scale-105 shadow-sm font-medium"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 5.8a8.5 8.5 0 01-2.36.64 4.13 4.13 0 001.81-2.27 8.2 8.2 0 01-2.61 1 4.1 4.1 0 00-7 3.74 11.64 11.64 0 01-8.45-4.29 4.16 4.16 0 00-.55 2.07 4.09 4.09 0 001.82 3.41 4.05 4.05 0 01-1.86-.51v.05a4.1 4.1 0 003.3 4 3.93 3.93 0 01-1.1.14 4 4 0 01-.77-.07 4.11 4.11 0 003.83 2.84A8.22 8.22 0 012 18.28a11.57 11.57 0 006.29 1.85A11.59 11.59 0 0020 8.45v-.53a8.43 8.43 0 002-2.12z" />
            </svg>
            <span>Twitter/X</span>
          </button>
          
          <button 
            onClick={() => shareOnSocial('linkedin')}
            className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-700 hover:bg-blue-800 text-white px-7 py-3 rounded-lg transition-all hover:scale-105 shadow-sm font-medium"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 3H4a1 1 0 00-1 1v16a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1zM8.339 18.337H5.667v-8.59h2.672v8.59zM7.003 8.574a1.548 1.548 0 110-3.096 1.548 1.548 0 010 3.096zm11.335 9.763h-2.669V14.16c0-.996-.018-2.277-1.388-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248h-2.667v-8.59h2.56v1.174h.037c.355-.675 1.227-1.387 2.524-1.387 2.704 0 3.203 1.778 3.203 4.092v4.71z" />
            </svg>
            <span>LinkedIn</span>
          </button>
          
          {navigator.share && (
            <button 
              onClick={handleShare}
              className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-7 py-3 rounded-lg transition-all hover:scale-105 shadow-sm font-medium"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Native Share</span>
            </button>
          )}
        </div>
      </section>
      
      <section className="bg-amber-100/50 p-6 rounded-lg border border-amber-200 mb-6">
        <h3 className="text-xl font-medium text-amber-800 mb-4">For Educators</h3>
        <p className="text-gray-700 font-serif mb-4 leading-relaxed">
          If you're an educator interested in using Young Darwin in your classroom, we plan to (eventually!) offer additional resources including:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700 font-serif mb-4">
          <li>Customizable lesson plans for various grade levels</li>
          <li>Guided activities and discussion questions</li>
          <li>Assessment rubrics aligned with history and science standards</li>
          <li>Background readings and supplementary materials</li>
        </ul>
        <p className="text-gray-700 font-serif">
          Please contact us at <a href="mailto:bebreen@ucsc.edu" className="text-amber-700 hover:underline font-medium">bebreen@ucsc.edu</a> for more information or to request these resources.
        </p>
      </section>
      
      <section className="border-t border-amber-300 pt-4 mt-8">
        <p className="text-sm text-gray-500 italic text-center">
          &copy; 2025 <a href="https://benjaminpbreen.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">Benjamin Breen</a> (<a href="https://ucsc.edu" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">UC Santa Cruz</a>) – <a href="https://historylens.org" target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline">HistoryLens Project</a>
        </p>
      </section>
    </div>
  );
};

const HamburgerMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeContent, setActiveContent] = useState(null); // 'about', 'learn-more', or 'share'
  const modalRef = useRef(null);

  // Toggle menu open/closed
  const toggleMenu = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setActiveContent(null); // Reset active content when opening menu
    }
  };

  // Handle menu item click
  const handleMenuItemClick = (contentType) => {
    setActiveContent(contentType);
    setIsOpen(false); // Close menu when showing content
  };

  // Close content modal
  const handleCloseContent = () => {
    setActiveContent(null);
  };

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleCloseContent();
      }
    };

    // Handle escape key press
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        if (activeContent) {
          handleCloseContent();
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    if (activeContent || isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [activeContent, isOpen]);

  // Render the appropriate content based on activeContent
  const renderContent = () => {
    switch (activeContent) {
      case 'about':
        return <AboutPage />;
      case 'learn-more':
        return <LearnMore />;
      case 'share':
        return <Share />;
      default:
        return null;
    }
  };

  return (
    <div className="relative z-50">
      {/* Hamburger Button with Ring Animation */}
      <button 
        className="fixed top-4 left-4 z-50 w-12 h-12 flex flex-col justify-center items-center gap-1.5 bg-amber-100 hover:bg-amber-200 rounded-full shadow-md transition-all duration-300 focus:outline-none border border-amber-300"
        onClick={toggleMenu}
        aria-label="Menu"
        aria-expanded={isOpen}
      >

        <span className={`block w-5 h-0.5 bg-amber-800 transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
        <span className={`block w-5 h-0.5 bg-amber-800 transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-0' : 'opacity-100'}`}></span>
        <span className={`block w-5 h-0.5 bg-amber-800 transition-transform duration-300 ease-in-out ${isOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
      </button>

      {/* Backdrop Overlay with Blur Effect */}
      {(isOpen || activeContent) && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            isOpen || activeContent ? 'opacity-100 z-40' : 'opacity-0 -z-10'
          }`}
          onClick={() => {
            if (activeContent) {
              handleCloseContent();
            } else {
              toggleMenu();
            }
          }}
        ></div>
      )}

      {/* Slide-out Menu with Enhanced Animation */}
      <div 
        className={`fixed top-0 left-0 h-full bg-amber-50 border-r border-amber-200 shadow-lg z-40 w-72 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Menu Header with Subtle Pattern Background */}
          <div className="p-5 border-b border-amber-200 bg-amber-100/60 relative ">
            <div className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundSize: '30px 30px'
              }}
            ></div>
            <h2 className="text-2xl py-2 translate-x-14 drop-shadow-xl font-bold text-amber-800 font-serif">Young Darwin</h2>
            <p className="text-m px-4 drop-shadow-xl py-4 text-amber-900 italic">An educational history simulation grounded in historical primary sources and powered by an LLM</p>
          </div>

          {/* Menu Items with Enhanced Hover Effects */}
          <nav className="p-4 flex-1 overflow-y-auto">
            <ul className="space-y-2">
              <li>
                <a 
                  href="#about" 
                  className="flex items-center p-3 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors relative group"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMenuItemClick('about');
                  }}
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 rounded-r-md transform scale-y-0 group-hover:scale-y-100 transition-transform origin-left"></span>
                  <span className="mr-3 text-amber-700 text-xl">ℹ️</span>
                  <span className="font-medium">About</span>
                </a>
              </li>
              <li>
                <a 
                  href="#learn-more" 
                  className="flex items-center p-3 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors relative group"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMenuItemClick('learn-more');
                  }}
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 rounded-r-md transform scale-y-0 group-hover:scale-y-100 transition-transform origin-left"></span>
                  <span className="mr-3 text-amber-700 text-xl">📚</span>
                  <span className="font-medium">Learn More</span>
                </a>
              </li>
              <li>
                <a 
                  href="#share" 
                  className="flex items-center p-3 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors relative group"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMenuItemClick('share');
                  }}
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 rounded-r-md transform scale-y-0 group-hover:scale-y-100 transition-transform origin-left"></span>
                  <span className="mr-3 text-amber-700 text-xl">🔗</span>
                  <span className="font-medium">Share</span>
                </a>
              </li>
              <li className="mt-6 border-t border-amber-200 pt-6">
                <a 
                  href="https://resobscura.substack.com/t/ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center p-3 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors relative group"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 rounded-r-md transform scale-y-0 group-hover:scale-y-100 transition-transform origin-left"></span>
                  <span className="mr-3 text-amber-700 text-xl">🌐</span>
                  <span className="font-medium">HistoryLens Project</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://ucsc.edu" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center p-3 rounded-lg text-amber-800 hover:bg-amber-100 transition-colors relative group"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-amber-500 rounded-r-md transform scale-y-0 group-hover:scale-y-100 transition-transform origin-left"></span>
                  <span className="mr-3 text-amber-700 text-xl">🏛️</span>
                  <span className="font-medium">UC Santa Cruz</span>
                </a>
              </li>
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-amber-200 bg-amber-50/80 text-center">
            <p className="text-xs text-amber-700">© 2025 Benjamin Breen (UCSC)</p>
            <p className="text-xs text-amber-600 mt-1">HistoryLens Project</p>
          </div>
        </div>
      </div>

      {/* Content Modal with Improved Animation and Close Button */}
     {activeContent && (
  <div 
    className="fixed inset-0 z-50 p-4 bg-black/60 backdrop-blur-sm overflow-auto animate-fadeIn"
    onClick={() => handleCloseContent()}
  >
    <div 
      ref={modalRef}
      className="relative max-w-3xl mx-auto w-full rounded-md bg-white animate-scaleIn"
      style={{ maxHeight: '90vh' }}
      onClick={(e) => e.stopPropagation()} // stop clicks from closing
    >
      {/* Close button */}
      <button 
        className="absolute top-2 right-2 ..."
        onClick={() => handleCloseContent()}
      >
        &times;
      </button>
      
      {/* Let the “about” or “learn more” pages scroll freely */}
      <div className="p-6 overflow-y-auto" style={{ maxHeight: '85vh' }}>
        {renderContent()}
      </div>
    </div>
  </div>
      )}

      {/* Animation styles */}
      <style jsx>{`

        .darwin-panel {

    max-height: 80vh !important;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  
  @media (max-height: 700px) {
    .darwin-panel {
      max-height: 70vh !important;
    }
  }

        @media (max-height: 700px) {
    .darwin-panel {
      max-height: 70vh;
    }
  }
  
  @media (max-height: 600px) {
    .darwin-panel {
      max-height: 60vh;
    }
  }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default HamburgerMenu;