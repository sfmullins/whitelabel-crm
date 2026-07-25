import type { OnboardingConfiguration } from "shared/onboarding";

export interface TemplateField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "dropdown" | "checkbox" | "url" | "email" | "phone";
  required?: boolean;
  options?: string[];
}

export interface TemplateObject {
  apiName: string;
  name: string;
  pluralName: string;
  description: string;
  fields: TemplateField[];
}

export interface DataModelTemplate {
  key: string;
  name: string;
  summary: string;
  bestFor: string;
  customerFields: TemplateField[];
  objects: TemplateObject[];
}

export const DATA_MODEL_TEMPLATES: DataModelTemplate[] = [
  {
    key: "b2b-services",
    name: "Business services",
    summary: "Companies, decision-makers, opportunities, projects and service agreements.",
    bestFor: "Consultancies, agencies, professional services and B2B operators",
    customerFields: [
      { name: "industry", label: "Industry", type: "text" },
      { name: "company_size", label: "Company size", type: "dropdown", options: ["1–9", "10–49", "50–249", "250+"] },
      { name: "lead_source", label: "How they found us", type: "text" },
    ],
    objects: [
      { apiName: "opportunity", name: "Opportunity", pluralName: "Opportunities", description: "Potential work being discussed with a customer.", fields: [
        { name: "estimated_value", label: "Estimated value", type: "number" },
        { name: "expected_close_date", label: "Expected decision date", type: "date" },
        { name: "next_step", label: "Next step", type: "text" },
      ]},
      { apiName: "project", name: "Project", pluralName: "Projects", description: "Work agreed or delivered for a customer.", fields: [
        { name: "start_date", label: "Start date", type: "date" },
        { name: "target_date", label: "Target completion date", type: "date" },
        { name: "project_status", label: "Status", type: "dropdown", options: ["Planned", "Active", "On hold", "Complete"] },
      ]},
    ],
  },
  {
    key: "b2c-services",
    name: "Consumer services",
    summary: "Individual customers, enquiries, appointments and ongoing service history.",
    bestFor: "Home services, personal services, clinics and appointment-led businesses",
    customerFields: [
      { name: "preferred_contact_method", label: "Preferred contact method", type: "dropdown", options: ["Phone", "Email", "Text"] },
      { name: "lead_source", label: "How they found us", type: "text" },
    ],
    objects: [
      { apiName: "appointment", name: "Appointment", pluralName: "Appointments", description: "A booked visit or consultation for a customer.", fields: [
        { name: "appointment_date", label: "Date", type: "date", required: true },
        { name: "service_requested", label: "Service requested", type: "text" },
        { name: "appointment_status", label: "Status", type: "dropdown", options: ["Requested", "Confirmed", "Completed", "Cancelled"] },
      ]},
    ],
  },
  {
    key: "ecommerce",
    name: "Online retail",
    summary: "Customers, orders, returns and product-related support.",
    bestFor: "Online shops and direct-to-consumer brands",
    customerFields: [
      { name: "acquisition_channel", label: "Acquisition channel", type: "text" },
      { name: "customer_tier", label: "Customer tier", type: "dropdown", options: ["New", "Repeat", "VIP"] },
    ],
    objects: [
      { apiName: "order", name: "Order", pluralName: "Orders", description: "A purchase placed by a customer.", fields: [
        { name: "order_number", label: "Order number", type: "text", required: true },
        { name: "order_value", label: "Order value", type: "number" },
        { name: "order_status", label: "Status", type: "dropdown", options: ["Placed", "Paid", "Dispatched", "Delivered", "Cancelled"] },
      ]},
      { apiName: "return", name: "Return", pluralName: "Returns", description: "A return or refund linked to a customer.", fields: [
        { name: "return_reason", label: "Reason", type: "text" },
        { name: "return_status", label: "Status", type: "dropdown", options: ["Requested", "Approved", "Received", "Refunded", "Declined"] },
      ]},
    ],
  },
  {
    key: "physical-retail",
    name: "Shop or physical retail",
    summary: "Customers, purchases, loyalty and in-store requests.",
    bestFor: "Shops, showrooms and location-based retailers",
    customerFields: [
      { name: "preferred_location", label: "Preferred location", type: "text" },
      { name: "loyalty_number", label: "Loyalty number", type: "text" },
    ],
    objects: [
      { apiName: "purchase", name: "Purchase", pluralName: "Purchases", description: "An in-store or assisted purchase.", fields: [
        { name: "receipt_number", label: "Receipt number", type: "text" },
        { name: "purchase_date", label: "Purchase date", type: "date" },
        { name: "purchase_value", label: "Purchase value", type: "number" },
      ]},
    ],
  },
  {
    key: "after-school-childcare",
    name: "After-school childcare",
    summary: "Guardians, children, enrolments, attendance and incident follow-up.",
    bestFor: "After-school services, school-age childcare and activity programmes",
    customerFields: [
      { name: "guardian_relationship", label: "Relationship to child", type: "text" },
      { name: "emergency_phone", label: "Emergency phone number", type: "phone" },
      { name: "preferred_contact_method", label: "Preferred contact method", type: "dropdown", options: ["Phone", "Email", "Text"] },
    ],
    objects: [
      { apiName: "child", name: "Child", pluralName: "Children", description: "A child connected to their parent or guardian record.", fields: [
        { name: "first_name", label: "First name", type: "text", required: true },
        { name: "last_name", label: "Last name", type: "text", required: true },
        { name: "date_of_birth", label: "Date of birth", type: "date" },
        { name: "school", label: "School", type: "text" },
        { name: "class_group", label: "Class or group", type: "text" },
        { name: "allergies_medical_notes", label: "Allergies and medical notes", type: "textarea" },
        { name: "additional_support_notes", label: "Additional support notes", type: "textarea" },
        { name: "authorised_collectors", label: "Authorised collectors", type: "textarea" },
      ]},
      { apiName: "childcare_enrolment", name: "Enrolment", pluralName: "Enrolments", description: "A child's place, schedule and collection arrangements.", fields: [
        { name: "child_name", label: "Child", type: "text", required: true },
        { name: "start_date", label: "Start date", type: "date" },
        { name: "days_attending", label: "Days attending", type: "text" },
        { name: "collection_arrangements", label: "Collection arrangements", type: "textarea" },
        { name: "enrolment_status", label: "Status", type: "dropdown", options: ["Enquiry", "Waitlist", "Offered", "Active", "Ended"] },
      ]},
      { apiName: "childcare_attendance", name: "Attendance record", pluralName: "Attendance records", description: "A daily arrival and collection record.", fields: [
        { name: "child_name", label: "Child", type: "text", required: true },
        { name: "attendance_date", label: "Date", type: "date", required: true },
        { name: "arrival_time", label: "Arrival time", type: "text" },
        { name: "collection_time", label: "Collection time", type: "text" },
        { name: "collected_by", label: "Collected by", type: "text" },
        { name: "attendance_status", label: "Status", type: "dropdown", options: ["Expected", "Present", "Absent", "Collected"] },
      ]},
      { apiName: "childcare_incident", name: "Incident follow-up", pluralName: "Incident follow-ups", description: "An incident, the response and guardian follow-up.", fields: [
        { name: "child_name", label: "Child", type: "text", required: true },
        { name: "incident_date", label: "Date", type: "date", required: true },
        { name: "incident_type", label: "Type", type: "dropdown", options: ["Injury", "Illness", "Behaviour", "Safeguarding concern", "Other"] },
        { name: "summary", label: "What happened", type: "textarea" },
        { name: "action_taken", label: "Action taken", type: "textarea" },
        { name: "guardian_notified", label: "Guardian notified", type: "checkbox" },
      ]},
    ],
  },
  {
    key: "pet-behaviour",
    name: "Pet behaviour practice",
    summary: "Owners, pets, behaviour cases, consultations and action plans.",
    bestFor: "Pet behaviourists, trainers and behaviour-led support services",
    customerFields: [
      { name: "preferred_contact_method", label: "Preferred contact method", type: "dropdown", options: ["Phone", "Email", "Text"] },
      { name: "referral_source", label: "Referral source", type: "text" },
    ],
    objects: [
      { apiName: "pet", name: "Pet", pluralName: "Pets", description: "An animal connected to its owner record.", fields: [
        { name: "pet_name", label: "Name", type: "text", required: true },
        { name: "species", label: "Species", type: "dropdown", options: ["Dog", "Cat", "Horse", "Bird", "Small animal", "Other"] },
        { name: "breed", label: "Breed", type: "text" },
        { name: "date_of_birth", label: "Date of birth", type: "date" },
        { name: "sex", label: "Sex", type: "dropdown", options: ["Female", "Male", "Unknown"] },
        { name: "neutered", label: "Neutered", type: "checkbox" },
        { name: "vet_details", label: "Veterinary practice", type: "text" },
        { name: "medical_considerations", label: "Medical considerations", type: "textarea" },
      ]},
      { apiName: "behaviour_case", name: "Behaviour case", pluralName: "Behaviour cases", description: "A behaviour concern, goals and current status.", fields: [
        { name: "pet_name", label: "Pet", type: "text", required: true },
        { name: "presenting_concern", label: "Presenting concern", type: "textarea", required: true },
        { name: "known_triggers", label: "Known triggers", type: "textarea" },
        { name: "owner_goals", label: "Owner goals", type: "textarea" },
        { name: "risk_notes", label: "Risk and safety notes", type: "textarea" },
        { name: "case_status", label: "Status", type: "dropdown", options: ["Enquiry", "Assessment", "Plan active", "Monitoring", "Closed"] },
      ]},
      { apiName: "behaviour_consultation", name: "Behaviour consultation", pluralName: "Behaviour consultations", description: "An assessment or follow-up session and its agreed actions.", fields: [
        { name: "pet_name", label: "Pet", type: "text", required: true },
        { name: "consultation_date", label: "Date", type: "date", required: true },
        { name: "session_type", label: "Session type", type: "dropdown", options: ["Initial assessment", "Home visit", "Remote consultation", "Follow-up"] },
        { name: "observations", label: "Observations", type: "textarea" },
        { name: "agreed_plan", label: "Agreed plan and homework", type: "textarea" },
        { name: "next_review_date", label: "Next review date", type: "date" },
      ]},
    ],
  },
  {
    key: "veterinary-practice",
    name: "Veterinary practice",
    summary: "Clients, animals, consultations, vaccinations and prescriptions.",
    bestFor: "Independent veterinary practices and mobile veterinary services",
    customerFields: [
      { name: "preferred_contact_method", label: "Preferred contact method", type: "dropdown", options: ["Phone", "Email", "Text"] },
      { name: "account_reference", label: "Account reference", type: "text" },
    ],
    objects: [
      { apiName: "pet", name: "Animal", pluralName: "Animals", description: "An animal connected to its client record.", fields: [
        { name: "pet_name", label: "Name", type: "text", required: true },
        { name: "species", label: "Species", type: "text", required: true },
        { name: "breed", label: "Breed", type: "text" },
        { name: "date_of_birth", label: "Date of birth", type: "date" },
        { name: "sex", label: "Sex", type: "dropdown", options: ["Female", "Male", "Unknown"] },
        { name: "microchip_number", label: "Microchip number", type: "text" },
        { name: "insurance_details", label: "Insurance details", type: "textarea" },
        { name: "allergies", label: "Allergies", type: "textarea" },
        { name: "ongoing_medication", label: "Ongoing medication", type: "textarea" },
      ]},
      { apiName: "veterinary_consultation", name: "Consultation", pluralName: "Consultations", description: "A clinical visit, findings and treatment plan.", fields: [
        { name: "pet_name", label: "Animal", type: "text", required: true },
        { name: "consultation_date", label: "Date", type: "date", required: true },
        { name: "presenting_concern", label: "Presenting concern", type: "textarea" },
        { name: "clinical_notes", label: "Clinical notes", type: "textarea" },
        { name: "diagnosis", label: "Diagnosis", type: "textarea" },
        { name: "treatment_plan", label: "Treatment plan", type: "textarea" },
        { name: "weight", label: "Weight", type: "number" },
        { name: "follow_up_date", label: "Follow-up date", type: "date" },
      ]},
      { apiName: "vaccination", name: "Vaccination", pluralName: "Vaccinations", description: "A vaccination administered or due.", fields: [
        { name: "pet_name", label: "Animal", type: "text", required: true },
        { name: "vaccine", label: "Vaccine", type: "text", required: true },
        { name: "administered_date", label: "Administered date", type: "date" },
        { name: "batch_number", label: "Batch number", type: "text" },
        { name: "next_due_date", label: "Next due date", type: "date" },
      ]},
      { apiName: "prescription", name: "Prescription", pluralName: "Prescriptions", description: "Prescribed medicine and directions.", fields: [
        { name: "pet_name", label: "Animal", type: "text", required: true },
        { name: "medicine", label: "Medicine", type: "text", required: true },
        { name: "directions", label: "Directions", type: "textarea" },
        { name: "prescribed_date", label: "Prescribed date", type: "date" },
        { name: "prescriber", label: "Prescriber", type: "text" },
      ]},
    ],
  },
  {
    key: "pet-grooming",
    name: "Pet grooming",
    summary: "Owners, pets, grooming preferences, appointments and visit history.",
    bestFor: "Grooming salons, mobile groomers and home-based grooming businesses",
    customerFields: [
      { name: "preferred_contact_method", label: "Preferred contact method", type: "dropdown", options: ["Phone", "Email", "Text"] },
      { name: "booking_notes", label: "Owner booking notes", type: "textarea" },
    ],
    objects: [
      { apiName: "pet", name: "Pet", pluralName: "Pets", description: "A pet connected to its owner record.", fields: [
        { name: "pet_name", label: "Name", type: "text", required: true },
        { name: "species", label: "Species", type: "dropdown", options: ["Dog", "Cat", "Other"] },
        { name: "breed", label: "Breed", type: "text" },
        { name: "date_of_birth", label: "Date of birth", type: "date" },
        { name: "coat_type", label: "Coat type", type: "text" },
        { name: "temperament_notes", label: "Temperament and handling notes", type: "textarea" },
        { name: "medical_considerations", label: "Medical considerations", type: "textarea" },
      ]},
      { apiName: "grooming_profile", name: "Grooming profile", pluralName: "Grooming profiles", description: "Usual style, products and handling preferences.", fields: [
        { name: "pet_name", label: "Pet", type: "text", required: true },
        { name: "preferred_style", label: "Preferred style or cut", type: "textarea" },
        { name: "blade_or_length", label: "Blade or coat length", type: "text" },
        { name: "product_notes", label: "Product and allergy notes", type: "textarea" },
        { name: "handling_notes", label: "Handling notes", type: "textarea" },
      ]},
      { apiName: "grooming_appointment", name: "Grooming appointment", pluralName: "Grooming appointments", description: "A booked grooming visit and its outcome.", fields: [
        { name: "pet_name", label: "Pet", type: "text", required: true },
        { name: "appointment_date", label: "Date", type: "date", required: true },
        { name: "services", label: "Services requested", type: "textarea" },
        { name: "appointment_status", label: "Status", type: "dropdown", options: ["Requested", "Confirmed", "Completed", "Cancelled", "No-show"] },
        { name: "visit_notes", label: "Visit notes", type: "textarea" },
        { name: "next_visit_due", label: "Next visit due", type: "date" },
      ]},
    ],
  },
  {
    key: "simple-crm",
    name: "Simple customer list",
    summary: "A clean starting point using only the standard customer, contact, activity and task records.",
    bestFor: "Businesses that want to shape the model themselves",
    customerFields: [],
    objects: [],
  },
];

export function rankDataModelTemplates(profile: OnboardingConfiguration["businessProfile"]): DataModelTemplate[] {
  const score = (template: DataModelTemplate): number => {
    let value = 0;
    const sectorTemplate: Record<OnboardingConfiguration["businessProfile"]["sector"], string | null> = {
      general: null,
      "after-school-childcare": "after-school-childcare",
      "pet-behaviour": "pet-behaviour",
      veterinary: "veterinary-practice",
      "pet-grooming": "pet-grooming",
    };
    if (sectorTemplate[profile.sector] === template.key) value += 30;
    if (profile.customerType === "businesses" && template.key === "b2b-services") value += 8;
    if (profile.customerType === "consumers" && template.key === "b2c-services") value += 6;
    if (profile.operatingModel === "ecommerce" && template.key === "ecommerce") value += 10;
    if (profile.operatingModel === "retail" && template.key === "physical-retail") value += 10;
    if (profile.operatingModel === "services" && ["b2b-services", "b2c-services"].includes(template.key)) value += 4;
    if (profile.booksAppointments && template.key === "b2c-services") value += 4;
    if (profile.tracksProducts && ["ecommerce", "physical-retail"].includes(template.key)) value += 3;
    return value;
  };
  return [...DATA_MODEL_TEMPLATES].sort((a, b) => score(b) - score(a));
}
