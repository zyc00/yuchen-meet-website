import React from 'react';
import { createRoot } from 'react-dom/client';
import { BookingPage } from '../components/booking-page';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><BookingPage /></React.StrictMode>);
