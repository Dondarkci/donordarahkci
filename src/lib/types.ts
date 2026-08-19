
export type LocationOption = {
  id: string;
  locationName: string;
  eventDate: string;
  maxQuota: number;
  currentRegistrations: number;
  updatedAt?: any;
  createdAt?: any;
};

export type ParticipantRegistration = {
  id: string;
  fullName: string;
  nik?: string;
  nipp?: string;
  unitKerja?: string;
  email: string;
  category: string;
  bloodType: string;
  eventSlotId: string;
  registrationDate: any;
  githubUserId: string;
  locationName?: string;
  locationDate?: string;
  status?: "Tidak Hadir" | "Berhasil" | "Tidak Berhasil";
};

// Alias for backward compatibility if needed in some components
export type Registration = ParticipantRegistration;
