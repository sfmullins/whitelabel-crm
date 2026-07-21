import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../components/layouts/MainLayout';
import Dashboard from '../pages/Dashboard';
import Organisations from '../pages/Organisations';
import OrganisationWorkspace from '../pages/OrganisationWorkspace';
import Contacts from '../pages/Contacts';
import FollowUps from '../pages/FollowUps';
import SearchResults from '../pages/SearchResults';
import Customers from '../pages/Customers';
import CustomerWorkspace from '../pages/CustomerWorkspace';
import Bookings from '../pages/Bookings';
import Invoices from '../pages/Invoices';
import Services from '../pages/Services';
import SettingsPage from '../pages/Settings';

export const router = createBrowserRouter([{
  path: '/',
  element: <MainLayout />,
  children: [
    { index: true, element: <Dashboard /> },
    { path: 'organisations', element: <Organisations /> },
    { path: 'organisations/:organisationId', element: <OrganisationWorkspace /> },
    { path: 'contacts', element: <Contacts /> },
    { path: 'follow-ups', element: <FollowUps /> },
    { path: 'search', element: <SearchResults /> },
    { path: 'customers', element: <Customers /> },
    { path: 'customers/:id', element: <CustomerWorkspace /> },
    { path: 'bookings', element: <Bookings /> },
    { path: 'invoices', element: <Invoices /> },
    { path: 'services', element: <Services /> },
    { path: 'settings', element: <SettingsPage /> },
  ],
}]);
