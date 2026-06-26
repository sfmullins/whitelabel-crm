import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../components/layouts/MainLayout';
import Dashboard from '../pages/Dashboard';
import Customers from '../pages/Customers';
import CustomerWorkspace from '../pages/CustomerWorkspace';
import Bookings from '../pages/Bookings';
import Invoices from '../pages/Invoices';
import Services from '../pages/Services';
import SettingsPage from '../pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'customers',
        element: <Customers />,
      },
      {
        path: 'customers/:id',
        element: <CustomerWorkspace />,
      },
      {
        path: 'bookings',
        element: <Bookings />,
      },
      {
        path: 'invoices',
        element: <Invoices />,
      },
      {
        path: 'services',
        element: <Services />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);
