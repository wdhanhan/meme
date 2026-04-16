/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Page } from './types';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import VoiceClonePage from './pages/VoiceClonePage';
import VoiceAuditionPage from './pages/VoiceAuditionPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen">
      {currentPage === 'landing' && (
        <LandingPage onNavigate={(page) => handleNavigate(page as Page)} />
      )}
      {currentPage === 'login' && (
        <LoginPage onLogin={() => handleNavigate('dashboard')} />
      )}
      {currentPage === 'dashboard' && (
        <Dashboard onNavigate={handleNavigate} />
      )}
      {currentPage === 'voice-clone' && (
        <VoiceClonePage onNavigate={handleNavigate} />
      )}
      {currentPage === 'voice-audition' && (
        <VoiceAuditionPage onNavigate={handleNavigate} />
      )}
    </div>
  );
}

