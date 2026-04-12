import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Center, Text } from '@mantine/core';
import { Layout } from './components/Layout/Layout';
import { Home } from './pages/Home/Home';
import { Stock } from './pages/Stock/Stock';
import { Settings } from './pages/Settings/Settings';
import { Login } from './pages/Login/Login';

const NOT_FOUND_MESSAGES = [
  'HTTP 404: This page has been delisted.',
  'Ticker not found. Have you tried GOOGL?',
  'This route has been soft-deleted.',
  'No liquidity at this address.',
  'Page went public and immediately halted.',
  'Circuit breaker triggered. Page unavailable.',
  'This URL filed for Chapter 11.',
  'Buy the rumor, sell the page — it\'s gone.',
  'Analyst consensus: strong sell on this URL.',
  'Page not found. Insider trading suspected.',
];

function NotFound() {
  const [msg] = useState(
    () => NOT_FOUND_MESSAGES[Math.floor(Math.random() * NOT_FOUND_MESSAGES.length)],
  );
  return (
    <Center h="60vh">
      <Text c="dimmed">{msg}</Text>
    </Center>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="stock/:watchlistId/:symbol" element={<Stock />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
