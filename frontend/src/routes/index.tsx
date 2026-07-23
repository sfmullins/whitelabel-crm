import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../components/layouts/MainLayout';
import Dashboard from '../pages/Dashboard';
import Reporting from '../pages/Reporting';
import Administration from '../pages/Administration';
import Extensions from '../pages/Extensions';
import ExtensionWorkspace from '../pages/ExtensionWorkspace';
import Organisations from '../pages/Organisations';
import OrganisationWorkspace from '../pages/OrganisationWorkspace';
import Contacts from '../pages/Contacts';
import FollowUps from '../pages/FollowUps';
import SearchResults from '../pages/SearchResults';
import Work from '../pages/Work';
import Documents from '../pages/Documents';
import Communications from '../pages/Communications';
import Automation from '../pages/Automation';
import Integrations from '../pages/Integrations';
import EmailInbox from '../pages/EmailInbox';
import CalendarWorkspace from '../pages/CalendarWorkspace';
import OperationsHealth from '../pages/OperationsHealth';
import Customers from '../pages/Customers';
import CustomerWorkspace from '../pages/CustomerWorkspace';
import Bookings from '../pages/Bookings';
import Invoices from '../pages/Invoices';
import Services from '../pages/Services';
import SettingsPage from '../pages/Settings';
import Onboarding from '../pages/Onboarding';
import About from '../pages/About';

export const router=createBrowserRouter([{
  path:'/',element:<MainLayout/>,children:[
    {index:true,element:<Dashboard/>},
    {path:'reporting',element:<Reporting/>},
    {path:'administration',element:<Administration/>},
    {path:'onboarding',element:<Onboarding/>},
    {path:'extensions',element:<Extensions/>},
    {path:'extensions/:packageKey/*',element:<ExtensionWorkspace/>},
    {path:'organisations',element:<Organisations/>},
    {path:'organisations/:organisationId',element:<OrganisationWorkspace/>},
    {path:'contacts',element:<Contacts/>},
    {path:'follow-ups',element:<FollowUps/>},
    {path:'search',element:<SearchResults/>},
    {path:'work',element:<Work/>},
    {path:'documents',element:<Documents/>},
    {path:'communications',element:<Communications/>},
    {path:'automation',element:<Automation/>},
    {path:'integrations',element:<Integrations/>},
    {path:'email',element:<EmailInbox/>},
    {path:'calendar-workspace',element:<CalendarWorkspace/>},
    {path:'operations-health',element:<OperationsHealth/>},
    {path:'customers',element:<Customers/>},
    {path:'customers/:id',element:<CustomerWorkspace/>},
    {path:'bookings',element:<Bookings/>},
    {path:'invoices',element:<Invoices/>},
    {path:'services',element:<Services/>},
    {path:'settings',element:<SettingsPage/>},
    {path:'about',element:<About/>},
  ],
}]);
