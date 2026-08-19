
"use client";

import { useState, useEffect, useRef } from "react";
import { Registration, LocationOption } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Droplet, Download, Trash2, SlidersHorizontal, Search, ArrowLeft, PlusCircle, LogOut, Lock, Settings, AlertCircle, Loader2, Calendar as CalendarIcon, Pencil, FilterX, AlertTriangle, RotateCcw, MapPin, ChevronLeft, ChevronRight, FileText, Printer, RefreshCw, Users, ClipboardCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { useFirestore, useCollection, useAuth, useMemoFirebase, useUser, useDoc } from "@/firebase";
import { collection, doc, updateDoc, getDocs, writeBatch, collectionGroup, serverTimestamp, deleteDoc, increment, addDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { cn } from "@/lib/utils";
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { id as localeId } from "date-fns/locale";
import RegistrationStatement from "@/components/RegistrationStatement";
import { ScrollArea } from "@/components/ui/scroll-area";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const ITEMS_PER_PAGE = 50;
const BLOOD_TYPES = ["A", "B", "AB", "O", "Tidak pernah diperiksa"];

export default function AdminPage() {
  const db = useFirestore();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [editingLoc, setEditingLoc] = useState<LocationOption | null>(null);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCapacity, setNewCapacity] = useState<number>(0);
  const [isResettingLocCount, setIsResettingLocCount] = useState(false);

  // Editing Registration State
  const [editingReg, setEditingReg] = useState<Registration | null>(null);
  const [editRegName, setEditRegName] = useState("");
  const [editRegEmail, setEditRegEmail] = useState("");
  const [editRegUnit, setEditRegUnit] = useState("");
  const [editRegIdNumber, setEditRegIdNumber] = useState("");
  const [editRegSlotId, setEditRegSlotId] = useState("");
  const [editRegBloodType, setEditRegBloodType] = useState("");
  const [editRegCategory, setEditRegCategory] = useState("");
  const [editRegDate, setEditRegDate] = useState("");

  // Statement View State
  const [viewingStatement, setViewingStatement] = useState<{ reg: Registration; index: number } | null>(null);
  const statementRef = useRef<HTMLDivElement>(null);

  const adminRoleRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(db, "roles_admin", user.uid);
  }, [db, user]);
  const { data: adminRoleData, isLoading: isAdminCheckLoading } = useDoc(adminRoleRef);

  const isSuperAdmin = user?.email?.toLowerCase() === "ronymunich@gmail.com";
  const hasAdminRole = !!adminRoleData;
  const isAuthorized = isSuperAdmin || hasAdminRole;

  const regsQuery = useMemoFirebase(() => {
    if (!isAuthorized) return null;
    return collectionGroup(db, "registrations");
  }, [db, isAuthorized]);
  const { data: registrations, isLoading: isRegsLoading } = useCollection<Registration>(regsQuery);

  const slotsQuery = useMemoFirebase(() => collection(db, "eventSlots"), [db]);
  const { data: locations, isLoading: isLocsLoading } = useCollection<LocationOption>(slotsQuery);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      toast({ title: "Berhasil Masuk", description: "Selamat datang kembali, Admin." });
    } catch (error: any) {
      toast({ 
        title: "Login Gagal", 
        description: error.message || "Email atau password salah.",
        variant: "destructive" 
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast({ title: "Berhasil Keluar" });
  };

  const handleSeedData = async () => {
    try {
      const initialSlots = [
        { id: "bnicity", locationName: "Stasiun BNI City", eventDate: "2026-03-13", maxQuota: 100, currentRegistrations: 0 },
        { id: "juanda", locationName: "Stasiun Juanda", eventDate: "2026-03-10", maxQuota: 100, currentRegistrations: 0 },
        { id: "manggarai", locationName: "Stasiun Manggarai", eventDate: "2026-03-11", maxQuota: 150, currentRegistrations: 0 },
        { id: "tanahabang", locationName: "Stasiun Tanah Abang", eventDate: "2026-03-12", maxQuota: 80, currentRegistrations: 0 }
      ];

      const batch = writeBatch(db);
      
      const currentSlotsSnap = await getDocs(collection(db, "eventSlots"));
      currentSlotsSnap.forEach((d) => {
        if (!initialSlots.find(s => s.id === d.id)) {
          batch.delete(d.ref);
        }
      });

      initialSlots.forEach(slot => {
        const ref = doc(db, "eventSlots", slot.id);
        batch.set(ref, { 
          ...slot, 
          createdAt: serverTimestamp(), 
          updatedAt: serverTimestamp() 
        });
      });
      
      await batch.commit();
      toast({ title: "Seed Berhasil", description: "Lokasi direset dan data lama dibersihkan." });
    } catch (e) {
      console.error(e);
      toast({ title: "Gagal Menambah Data", variant: "destructive" });
    }
  };

  const handleGenerateSamples = async () => {
    if (!user || !locations || locations.length === 0) {
      toast({ title: "Gagal", description: "Pastikan lokasi (seed) sudah ada.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const samples = [
        { fullName: "Budi Santoso", email: "budi@email.com", category: "Pegawai KCI", nipp: "12345", unitKerja: "Operasi", bloodType: "A" },
        { fullName: "Siti Aminah", email: "siti@email.com", category: "Umum", nik: "320123456789", bloodType: "B" },
        { fullName: "Agus Wijaya", email: "agus@email.com", category: "Pegawai KCI", nipp: "67890", unitKerja: "Sarana", bloodType: "O" },
        { fullName: "Dewi Lestari", email: "dewi@email.com", category: "Umum", nik: "320987654321", bloodType: "AB" },
        { fullName: "Rudi Hermawan", email: "rudi@email.com", category: "Pegawai KCI", nipp: "11223", unitKerja: "IT", bloodType: "A" }
      ];

      for (const sample of samples) {
        const randomLoc = locations[Math.floor(Math.random() * locations.length)];
        const registrationId = doc(collection(db, "temp")).id;
        const regRef = doc(db, "users", user.uid, "registrations", registrationId);
        
        const regData = {
          ...sample,
          id: registrationId,
          eventSlotId: randomLoc.id,
          locationName: randomLoc.locationName,
          locationDate: randomLoc.eventDate,
          registrationDate: serverTimestamp(),
          githubUserId: user.uid,
          status: "Tidak Hadir"
        };

        await updateDoc(doc(db, "eventSlots", randomLoc.id), { 
          currentRegistrations: increment(1),
          updatedAt: serverTimestamp()
        });
        
        const batch = writeBatch(db);
        batch.set(regRef, regData);
        await batch.commit();
      }
      toast({ title: "Berhasil", description: "5 Pendaftar contoh telah dibuat." });
    } catch (error: any) {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSyncQuotas = async () => {
    if (!registrations || !locations) return;
    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      const actualCounts: Record<string, number> = {};

      registrations.forEach((reg) => {
        if (reg.eventSlotId) {
          actualCounts[reg.eventSlotId] = (actualCounts[reg.eventSlotId] || 0) + 1;
        }
      });

      locations.forEach((loc) => {
        const actualCount = actualCounts[loc.id] || 0;
        if (loc.currentRegistrations !== actualCount) {
          const locRef = doc(db, "eventSlots", loc.id);
          batch.update(locRef, { 
            currentRegistrations: actualCount,
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
      toast({ 
        title: "Sinkronisasi Berhasil", 
        description: "Angka kuota telah diperbarui sesuai jumlah pendaftar asli di database." 
      });
    } catch (error: any) {
      toast({ title: "Gagal Sinkronisasi", description: error.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReset = async () => {
    try {
      const batch = writeBatch(db);
      const regsSnap = await getDocs(collectionGroup(db, "registrations"));
      regsSnap.forEach((d) => batch.delete(d.ref));

      const slotsSnap = await getDocs(collection(db, "eventSlots"));
      slotsSnap.forEach((d) => batch.update(d.ref, { currentRegistrations: 0, updatedAt: serverTimestamp() }));

      await batch.commit();
      toast({ title: "Data Berhasil Dihapus" });
    } catch (e) {
      toast({ title: "Gagal Reset", variant: "destructive" });
    }
  };

  const handleDeleteReg = async (reg: Registration) => {
    try {
      const batch = writeBatch(db);
      
      const slot = locations?.find(l => l.id === reg.eventSlotId);
      const regRef = doc(db, "users", reg.githubUserId, "registrations", reg.id);
      batch.delete(regRef);
      
      if (slot) {
        const slotUpdateSecs = slot.updatedAt?.seconds || 0;
        const regDateSecs = reg.registrationDate?.seconds || 0;
        const currentCount = slot.currentRegistrations || 0;

        if (regDateSecs > slotUpdateSecs && currentCount > 0) {
          const slotRef = doc(db, "eventSlots", reg.eventSlotId);
          batch.update(slotRef, { 
            currentRegistrations: increment(-1) 
          });
        }
      }
      
      await batch.commit();
      toast({ 
        title: "Pendaftar Berhasil Dihapus", 
        description: `Data ${reg.fullName} telah dihapus.` 
      });
    } catch (e) {
      console.error(e);
      toast({ title: "Gagal Menghapus Data", variant: "destructive" });
    }
  };

  const handleUpdateStatus = (reg: Registration, newStatus: string) => {
    const regRef = doc(db, "users", reg.githubUserId, "registrations", reg.id);
    updateDoc(regRef, { 
      status: newStatus, 
      updatedAt: serverTimestamp() 
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: regRef.path,
        operation: 'update',
        requestResourceData: { status: newStatus },
      });
      errorEmitter.emit('permission-error', permissionError);
    });
    toast({ 
      title: "Status Diperbarui", 
      description: `Status ${reg.fullName} kini: ${newStatus}` 
    });
  };

  const downloadExcel = () => {
    if (!registrations || registrations.length === 0) {
      toast({ title: "Gagal Download", description: "Belum ada data pendaftar.", variant: "destructive" });
      return;
    }

    const headers = ["Nama Lengkap", "NIK/NIPP", "Unit Kerja", "Email", "Gol. Darah", "Kategori", "Lokasi", "Tanggal", "Status", "Waktu Daftar"];
    const rows = filteredData.map(r => [
      r.fullName,
      r.category === "Pegawai KCI" || r.category === "Internal" ? `'${r.nipp || r.nik || ""}` : `'${r.nik || r.nipp || ""}`,
      r.unitKerja || "-",
      r.email,
      r.bloodType || "-",
      r.category === "Internal" ? "Pegawai KCI" : r.category,
      r.locationName || "",
      r.locationDate || "",
      r.status || "Tidak Hadir",
      r.registrationDate ? new Date(r.registrationDate.seconds * 1000).toLocaleString('id-ID') : ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Data_Donor_KCI.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveLocation = async () => {
    if (newCapacity < 0) {
      toast({ title: "Kapasitas tidak valid", variant: "destructive" });
      return;
    }
    if (!editingLoc) return;
    try {
      const slotRef = doc(db, "eventSlots", editingLoc.id);
      const updateData: any = { 
        locationName: newName.trim(),
        eventDate: newDate,
        maxQuota: newCapacity, 
        updatedAt: serverTimestamp() 
      };

      if (isResettingLocCount) {
        updateData.currentRegistrations = 0;
      }

      await updateDoc(slotRef, updateData);
      setEditingLoc(null);
      setIsResettingLocCount(false);
      toast({ title: "Data Lokasi Diperbarui" });
    } catch (e) {
      toast({ title: "Gagal Update", variant: "destructive" });
    }
  };

  const handleEditReg = (reg: Registration) => {
    setEditingReg(reg);
    setEditRegName(reg.fullName);
    setEditRegEmail(reg.email);
    setEditRegUnit(reg.unitKerja || "");
    const idNum = (reg.category === "Pegawai KCI" || reg.category === "Internal") ? (reg.nipp || reg.nik || "") : (reg.nik || reg.nipp || "");
    setEditRegIdNumber(idNum);
    setEditRegSlotId(reg.eventSlotId);
    setEditRegBloodType(reg.bloodType || "");
    setEditRegCategory(reg.category || "Pegawai KCI");
    
    if (reg.registrationDate?.seconds) {
      const d = new Date(reg.registrationDate.seconds * 1000);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      setEditRegDate(localISOTime);
    } else {
      setEditRegDate("");
    }
  };

  const handleSaveReg = async () => {
    if (!editingReg) return;
    try {
      const regRef = doc(db, "users", editingReg.githubUserId, "registrations", editingReg.id);
      const batch = writeBatch(db);
      
      const updateData: any = {
        fullName: editRegName,
        email: editRegEmail,
        bloodType: editRegBloodType,
        category: editRegCategory,
        updatedAt: serverTimestamp()
      };

      if (editRegDate) {
        updateData.registrationDate = new Date(editRegDate);
      }

      if (editRegCategory === "Pegawai KCI" || editRegCategory === "Internal") {
        updateData.nipp = editRegIdNumber;
        updateData.unitKerja = editRegUnit;
        updateData.nik = "";
      } else {
        updateData.nik = editRegIdNumber;
        updateData.nipp = "";
        updateData.unitKerja = "";
      }

      if (editRegSlotId !== editingReg.eventSlotId) {
        const oldSlot = locations?.find(l => l.id === editingReg.eventSlotId);
        const newSlot = locations?.find(l => l.id === editRegSlotId);
        
        if (newSlot) {
          updateData.eventSlotId = editRegSlotId;
          updateData.locationName = newSlot.locationName;
          updateData.locationDate = newSlot.eventDate;

          const oldSlotRef = doc(db, "eventSlots", editingReg.eventSlotId);
          const newSlotRef = doc(db, "eventSlots", editRegSlotId);

          if (oldSlot) {
            const oldSlotUpdateSecs = oldSlot.updatedAt?.seconds || 0;
            const regDateSecs = editingReg.registrationDate?.seconds || 0;
            const currentCount = oldSlot.currentRegistrations || 0;
            
            if (regDateSecs > oldSlotUpdateSecs && currentCount > 0) {
              batch.update(oldSlotRef, { currentRegistrations: increment(-1) });
            }
          }

          batch.update(newSlotRef, { currentRegistrations: increment(1) });
        }
      }

      batch.update(regRef, updateData);
      await batch.commit();

      setEditingReg(null);
      toast({ title: "Data Pendaftar Berhasil Diperbarui" });
    } catch (e) {
      console.error(e);
      toast({ title: "Gagal Memperbarui Data", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async () => {
    if (!viewingStatement || !statementRef.current) return;
    
    const { reg } = viewingStatement;
    let formattedDate = reg.locationDate || "Kegiatan";
    try {
      if (reg.locationDate) {
        const eventDate = parseISO(reg.locationDate);
        formattedDate = format(eventDate, "dd MMMM yyyy", { locale: localeId });
      }
    } catch (e) {
      console.error(e);
    }

    const filename = `${reg.fullName} (${formattedDate}).pdf`;
    const html2pdf = (await import('html2pdf.js')).default;
    
    const element = statementRef.current;
    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    toast({ title: "Sedang Menyiapkan PDF", description: "Mohon tunggu sebentar..." });
    html2pdf().set(opt).from(element).save();
  };

  const getMonthlyIndex = (reg: Registration) => {
    if (!reg.locationDate || !registrations) return 0;
    try {
      const eventDate = parseISO(reg.locationDate);
      const monthYearKey = format(eventDate, "yyyy-MM");
      
      const monthlyItems = registrations
        .filter(r => {
          if (!r.locationDate) return false;
          try {
            const rDate = parseISO(r.locationDate);
            return format(rDate, "yyyy-MM") === monthYearKey;
          } catch { return false; }
        })
        .sort((a, b) => (a.registrationDate?.seconds || 0) - (b.registrationDate?.seconds || 0));
      
      const index = monthlyItems.findIndex(item => item.id === reg.id);
      return index + 1;
    } catch (e) {
      return 0;
    }
  };

  const filteredData = (registrations || [])
    .filter(r => {
      const matchesSearch = r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.nik && r.nik.includes(searchQuery)) ||
        (r.nipp && r.nipp.includes(searchQuery)) ||
        r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.category?.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesDate = true;
      if (startDate && endDate && r.locationDate) {
        try {
          const eventDate = parseISO(r.locationDate);
          const start = startOfDay(parseISO(startDate));
          const end = endOfDay(parseISO(endDate));
          matchesDate = isWithinInterval(eventDate, { start, end });
        } catch (e) {
          matchesDate = true;
        }
      }

      let matchesLocation = true;
      if (selectedLocation !== "all") {
        matchesLocation = r.eventSlotId === selectedLocation;
      }

      return matchesSearch && matchesDate && matchesLocation;
    })
    .sort((a, b) => {
      const timeA = a.registrationDate?.seconds || 0;
      const timeB = b.registrationDate?.seconds || 0;
      return timeB - timeA;
    });

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalActiveSeedRegistrations = locations?.reduce((sum, loc) => sum + (loc.currentRegistrations || 0), 0) || 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, selectedLocation]);

  if (isUserLoading || (user && isAdminCheckLoading)) {
    return (
      <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
          <p className="font-bold text-[#8B4513]">Memeriksa Otoritas Admin...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 rounded-[40px] border-none shadow-2xl bg-white space-y-8">
          <div className="text-center space-y-3">
            <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-primary">
              <Lock className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-headline font-bold text-[#2D241E]">Admin Login</h1>
            <p className="text-[#80766E] font-body text-base">Halaman ini hanya untuk admin terdaftar.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label className="font-bold text-[#2D241E]">Email Admin</Label>
              <Input 
                type="email" 
                placeholder="admin@email.com" 
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="h-14 bg-[#F8F7F4] border-none rounded-2xl" 
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-[#2D241E]">Password</Label>
              <Input 
                type="password" 
                placeholder="••••••••" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="h-14 bg-[#F8F7F4] border-none rounded-2xl" 
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full h-14 bg-primary text-white rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
            >
              {isLoggingIn ? "Memproses..." : "Masuk Sekarang"}
            </button>
            <Link href="/" className="block">
              <Button variant="ghost" className="w-full h-12 rounded-2xl text-[#80766E]">
                <ArrowLeft className="h-4 w-4 mr-2" /> Kembali ke Beranda
              </Button>
            </Link>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] p-6 md:p-12 space-y-8 font-body">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[#8B4513]">
          <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-bold border-r border-[#8B4513]/20 pr-4">Ke Pendaftaran</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{user.email} (Online)</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-[#8B4513] hover:bg-[#8B4513]/5 gap-2 font-bold">
                <Settings className="h-4 w-4" /> Pengaturan
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-none shadow-xl bg-white p-2 min-w-[200px]">
              <Link href="/admin/developer">
                <DropdownMenuItem className="cursor-pointer font-bold py-3 px-4 rounded-lg focus:bg-primary/5 focus:text-primary transition-colors">
                  Pengaturan Developer & Akses
                </DropdownMenuItem>
              </Link>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={handleLogout} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2 font-bold">
            <LogOut className="h-4 w-4" /> Keluar
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Droplet className="h-8 w-8 text-primary fill-primary" />
            <h1 className="text-4xl font-headline font-bold text-[#2D241E]">Dashboard Admin</h1>
          </div>
          <p className="text-[#80766E] text-lg">Monitoring pendaftaran donor darah PT. KCI</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSeedData} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-12 rounded-xl px-5 font-bold shadow-sm">
            <PlusCircle className="h-4 w-4" /> Seed Lokasi
          </Button>

          <Button 
            onClick={handleGenerateSamples} 
            disabled={isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-12 rounded-xl px-5 font-bold shadow-sm"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Sample Pendaftar
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="bg-[#FDF8F8] border-[#F5E6E6] text-[#C05656] hover:bg-[#F5E6E6] gap-2 h-12 rounded-xl px-5 font-bold shadow-sm">
                <Trash2 className="h-4 w-4" /> Reset Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-headline font-bold text-[#2D241E]">Hapus Semua Data?</AlertDialogTitle>
                <AlertDialogDescription className="text-base text-[#80766E]">Tindakan ini akan menghapus semua pendaftar secara permanen. Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-12 rounded-xl font-bold">Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="h-12 rounded-xl bg-destructive text-white font-bold">Ya, Hapus Semua</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={downloadExcel} className="bg-[#3A7E49] hover:bg-[#2F663B] text-white gap-2 h-12 rounded-xl px-6 font-bold shadow-sm">
            <Download className="h-4 w-4" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLocsLoading ? <p className="col-span-full text-center py-10">Memuat lokasi...</p> : 
          locations?.map((loc) => {
            const count = Math.max(loc.currentRegistrations || 0, 0);
            const percentage = Math.min((count / loc.maxQuota) * 100, 100);
            return (
              <Card key={loc.id} className="border-none shadow-sm rounded-2xl relative overflow-hidden bg-white">
                <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-[#3D1408] opacity-90" />
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-bold text-[16px] text-[#2D241E] truncate">{loc.locationName || "Tanpa Nama"}</h3>
                      <p className="text-xs text-[#80766E]">{loc.eventDate || "Tanpa Tanggal"}</p>
                    </div>
                    <button onClick={() => { setEditingLoc(loc); setNewName(loc.locationName || ""); setNewDate(loc.eventDate || ""); setNewCapacity(loc.maxQuota); setIsResettingLocCount(false); }} className="p-1.5 hover:bg-muted rounded-full shrink-0">
                      <SlidersHorizontal className="h-4 w-4 text-[#80766E]/60" />
                    </button>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[#3D1408]">{count}</span>
                    <span className="text-[#80766E] text-sm font-medium">/ {loc.maxQuota} Slot</span>
                  </div>
                  <div className="pt-1">
                    <div className="h-2 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-700" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        }
      </div>

      <Card className="border-none shadow-sm rounded-[32px] overflow-hidden bg-white">
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-[700px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-[#80766E]/40" />
              <Input placeholder="Cari nama, ID, email, atau unit..." className="pl-14 h-14 bg-[#F8F7F4] border-none rounded-2xl text-base" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                onClick={handleSyncQuotas} 
                disabled={isSyncing}
                variant="outline" 
                className="h-14 px-5 rounded-2xl border-none bg-[#F8F7F4] text-primary font-bold gap-2 hover:bg-primary/5 transition-colors"
              >
                {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
                Sync Kuota
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-14 px-5 rounded-2xl border-none bg-[#F8F7F4] text-[#80766E] font-bold gap-2", (startDate || endDate || selectedLocation !== "all") && "text-primary bg-primary/5")}>
                    <SlidersHorizontal className="h-5 w-5" />
                    Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-6 rounded-3xl border-none shadow-2xl space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-[#80766E]">Filter Lokasi</Label>
                    <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                      <SelectTrigger className="bg-[#F8F7F4] border-none rounded-xl h-11">
                        <SelectValue placeholder="Semua Lokasi" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-xl">
                        <SelectItem value="all">Semua Lokasi</SelectItem>
                        {locations?.filter(l => l.locationName).map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.locationName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-[#80766E]">Dari Tanggal</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-[#F8F7F4] border-none rounded-xl h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-[#80766E]">Sampai Tanggal</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-[#F8F7F4] border-none rounded-xl h-11" />
                  </div>
                  {(startDate || endDate || selectedLocation !== "all") && (
                    <Button variant="ghost" onClick={() => { setStartDate(""); setEndDate(""); setSelectedLocation("all"); }} className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 font-bold h-11 gap-2 rounded-xl">
                      <FilterX className="h-4 w-4" /> Reset Filter
                    </Button>
                  )}
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 border border-emerald-100 rounded-full px-6 py-2.5 shadow-sm h-14 flex items-center">
                  <span className="font-bold text-base text-emerald-700 whitespace-nowrap">Seed Aktif: {totalActiveSeedRegistrations} Orang</span>
                </div>
                <div className="bg-white border border-[#E5E7EB] rounded-full px-6 py-2.5 shadow-sm h-14 flex items-center">
                  <span className="font-bold text-base text-[#2D241E] whitespace-nowrap">Total Pendaftar: {registrations?.length || 0} Orang</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Nama Lengkap</TableHead>
                  <TableHead className="text-center">ID (NIK/NIPP)</TableHead>
                  <TableHead className="text-center">Gol. Darah</TableHead>
                  <TableHead className="text-center">Unit Kerja</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Kategori</TableHead>
                  <TableHead className="text-center">Lokasi</TableHead>
                  <TableHead className="text-center">Keterangan</TableHead>
                  <TableHead className="text-center">Waktu Daftar</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                  <TableHead className="text-right">Form</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRegsLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-20 italic">Memuat data pendaftar...</TableCell></TableRow>
                ) : paginatedData.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-20 italic">Belum ada data pendaftar.</TableCell></TableRow>
                ) : (
                  paginatedData.map((reg) => {
                    const monthlyIndex = getMonthlyIndex(reg);
                    
                    return (
                      <TableRow key={reg.id}>
                        <TableCell className="font-bold text-center capitalize">{reg.fullName}</TableCell>
                        <TableCell className="font-bold text-center">
                          {(reg.nipp || reg.nik || "-")}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 text-red-700 font-bold text-[10px] md:text-xs border border-red-100 p-1 text-center leading-tight">
                            {reg.bloodType === "Tidak pernah diperiksa" ? "N/A" : (reg.bloodType || "-")}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{reg.unitKerja || "-"}</TableCell>
                        <TableCell className="text-center">{reg.email}</TableCell>
                        <TableCell className="text-center">
                          <span className={cn("px-2 py-1 rounded-full text-xs font-bold", (reg.category === "Pegawai KCI" || reg.category === "Internal") ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600")}>
                            {reg.category === "Internal" ? "Pegawai KCI" : reg.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="font-bold">{reg.locationName}</div>
                          <div className="text-[10px] text-[#80766E]">{reg.locationDate}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold",
                              reg.status === "Berhasil" ? "bg-emerald-100 text-emerald-700" :
                              reg.status === "Tidak Berhasil" ? "bg-red-100 text-red-700" :
                              "bg-orange-100 text-orange-700"
                            )}>
                              {reg.status || "Tidak Hadir"}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-muted">
                                  <Pencil className="h-3.5 w-3.5 text-[#80766E]" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl border-none shadow-xl bg-white p-2">
                                <DropdownMenuItem 
                                  onClick={() => handleUpdateStatus(reg, "Berhasil")}
                                  className="text-emerald-700 font-bold focus:bg-emerald-50 cursor-pointer"
                                >
                                  Berhasil
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleUpdateStatus(reg, "Tidak Berhasil")}
                                  className="text-red-700 font-bold focus:bg-red-50 cursor-pointer"
                                >
                                  Tidak Berhasil
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleUpdateStatus(reg, "Tidak Hadir")}
                                  className="text-orange-700 font-bold focus:bg-orange-50 cursor-pointer"
                                >
                                  Tidak Hadir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                        <TableCell className="text-[#A09891] text-sm text-center">
                          {reg.registrationDate ? new Date(reg.registrationDate.seconds * 1000).toLocaleString('id-ID') : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEditReg(reg)}
                              className="text-primary hover:text-primary hover:bg-primary/10 rounded-full h-8 w-8 p-0"
                              title="Edit Data"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full h-8 w-8 p-0"
                                  title="Hapus Pendaftar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-[32px] border-none shadow-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-2xl font-headline font-bold text-[#2D241E] flex items-center gap-2">
                                    <AlertTriangle className="h-6 w-6 text-red-500" /> Hapus Pendaftar?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-[#80766E] text-base">
                                    Apakah Anda yakin ingin menghapus data <strong>{reg.fullName}</strong>? 
                                    Tindakan ini akan mengembalikan 1 slot kuota untuk lokasi <strong>{reg.locationName}</strong> jika pendaftaran dilakukan setelah proses seed terakhir.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="gap-2">
                                  <AlertDialogCancel className="h-12 rounded-xl font-bold border-none bg-[#F8F7F4]">Batal</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDeleteReg(reg)} 
                                    className="h-12 rounded-xl bg-destructive text-white font-bold"
                                  >
                                    Ya, Hapus Data
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setViewingStatement({ reg, index: monthlyIndex })}
                            className="text-[#80766E] hover:text-primary hover:bg-primary/5 rounded-full h-8 w-8 p-0"
                            title="Lihat Form"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-[#F5F3EF]">
              <div className="text-sm text-[#80766E] font-medium order-2 md:order-1">
                Menampilkan <span className="font-bold text-[#2D241E]">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-[#2D241E]">{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)}</span> dari <span className="font-bold text-[#2D241E]">{filteredData.length}</span> pendaftar yang difilter
              </div>
              <div className="flex items-center gap-2 order-1 md:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="rounded-xl h-10 px-3 font-bold border-none bg-[#F8F7F4] hover:bg-primary/5 hover:text-primary transition-colors disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Sebelum
                </Button>
                
                <div className="hidden sm:flex items-center gap-1 mx-2">
                  {[...Array(totalPages)].map((_, i) => {
                    const pageNum = i + 1;
                    if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                      return (
                        <Button
                          key={pageNum}
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "h-10 w-10 rounded-xl font-bold transition-all",
                            currentPage === pageNum 
                              ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20" 
                              : "text-[#80766E] hover:bg-primary/5 hover:text-primary"
                          )}
                        >
                          {pageNum}
                        </Button>
                      );
                    } else if ((pageNum === 2 && currentPage > 3) || (pageNum === totalPages - 1 && currentPage < totalPages - 2)) {
                      return <span key={pageNum} className="px-1 text-[#80766E]">...</span>;
                    }
                    return null;
                  })}
                </div>

                <div className="sm:hidden font-bold text-sm bg-primary/5 text-primary px-4 py-2 rounded-xl">
                  {currentPage} / {totalPages}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="rounded-xl h-10 px-3 font-bold border-none bg-[#F8F7F4] hover:bg-primary/5 hover:text-primary transition-colors disabled:opacity-30"
                >
                  Lanjut <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Viewing Statement Dialog */}
      <Dialog open={!!viewingStatement} onOpenChange={(open) => !open && setViewingStatement(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 rounded-[32px] border-none shadow-2xl overflow-hidden">
          <DialogHeader className="bg-primary p-6 pr-12 text-white flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-headline font-bold">Formulir Pernyataan Pendaftar</DialogTitle>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-2 font-bold"
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-80px)]">
            <div ref={statementRef}>
              {viewingStatement && (
                <RegistrationStatement 
                  registration={viewingStatement.reg} 
                  index={viewingStatement.index} 
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Location Dialog */}
      <Dialog open={!!editingLoc} onOpenChange={(open) => !open && setEditingLoc(null)}>
        <DialogContent className="sm:max-w-md rounded-[32px] border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline font-bold">Edit Detail Lokasi</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Nama Lokasi</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Boleh dikosongkan untuk menonaktifkan" className="h-12 bg-[#F8F7F4] border-none rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Tanggal Event</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Kapasitas</Label>
              <Input type="number" value={newCapacity} onChange={(e) => setNewCapacity(parseInt(e.target.value) || 0)} className="h-12 bg-[#F8F7F4] border-none rounded-xl" />
            </div>
            
            <div className="pt-2">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => setIsResettingLocCount(!isResettingLocCount)}
                className={cn("w-full h-12 rounded-xl border-dashed gap-2 transition-colors", isResettingLocCount ? "border-primary text-primary bg-primary/5" : "border-[#E5E7EB] text-[#80766E]")}
              >
                <RotateCcw className={cn("h-4 w-4", isResettingLocCount && "animate-spin")} />
                {isResettingLocCount ? "Batal Reset Pendaftar" : "Reset Jumlah Pendaftar ke 0"}
              </Button>
              {isResettingLocCount && (
                <p className="text-[10px] text-primary mt-2 px-2">*Jumlah pendaftar akan di-nolkan setelah Anda klik Simpan.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingLoc(null)} className="h-12 rounded-xl border-none bg-[#F8F7F4]">Batal</Button>
            <Button onClick={handleSaveLocation} className="h-12 rounded-xl bg-primary text-white font-bold">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Registration Dialog */}
      <Dialog open={!!editingReg} onOpenChange={(open) => !open && setEditingReg(null)}>
        <DialogContent className="sm:max-w-md rounded-[32px] border-none shadow-2xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-headline font-bold">Edit Data Pendaftar</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Nama Lengkap</Label>
              <Input value={editRegName} onChange={(e) => setEditRegName(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Email</Label>
              <Input type="email" value={editRegEmail} onChange={(e) => setEditRegEmail(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-2xl" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold">Kategori</Label>
                <Select value={editRegCategory} onValueChange={setEditRegCategory}>
                  <SelectTrigger className="h-12 bg-[#F8F7F4] border-none rounded-xl">
                    <SelectValue placeholder="Pilih Kategori" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-xl">
                    <SelectItem value="Pegawai KCI" className="rounded-lg">Pegawai KCI</SelectItem>
                    <SelectItem value="Umum" className="rounded-lg">Umum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">Golongan Darah</Label>
                <Select value={editRegBloodType} onValueChange={setEditRegBloodType}>
                  <SelectTrigger className="h-12 bg-[#F8F7F4] border-none rounded-xl">
                    <SelectValue placeholder="Gol. Darah" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-xl">
                    {BLOOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="rounded-lg">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {(editRegCategory === "Pegawai KCI" || editRegCategory === "Internal") && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">NIPP/NIK</Label>
                  <Input value={editRegIdNumber} onChange={(e) => setEditRegIdNumber(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-2xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Unit Kerja</Label>
                  <Input value={editRegUnit} onChange={(e) => setEditRegUnit(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-2xl" />
                </div>
              </>
            )}

            {editRegCategory === "Umum" && (
              <div className="space-y-2">
                <Label className="text-sm font-bold">NIK</Label>
                <Input value={editRegIdNumber} onChange={(e) => setEditRegIdNumber(e.target.value)} className="h-12 bg-[#F8F7F4] border-none rounded-2xl" />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-bold">Waktu Daftar</Label>
              <Input 
                type="datetime-local" 
                value={editRegDate} 
                onChange={(e) => setEditRegDate(e.target.value)} 
                className="h-12 bg-[#F8F7F4] border-none rounded-2xl" 
              />
            </div>
            
            {(() => {
              if (!editingReg) return null;
              const currentSlot = locations?.find(l => l.id === editingReg.eventSlotId);
              if (!currentSlot) return null;

              const regDateSecs = editingReg.registrationDate?.seconds || 0;
              const slotUpdateSecs = currentSlot.updatedAt?.seconds || 0;
              
              if (regDateSecs > slotUpdateSecs) {
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-bold">Lokasi & Waktu Kegiatan</Label>
                    <Select value={editRegSlotId} onValueChange={setEditRegSlotId}>
                      <SelectTrigger className="h-12 bg-[#F8F7F4] border-none rounded-xl">
                        <SelectValue placeholder="Pilih Lokasi" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-xl">
                        {locations?.filter(l => l.locationName).map((loc) => (
                          <SelectItem key={loc.id} value={loc.id} className="rounded-lg">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-primary" />
                              <span>{loc.locationName} - {loc.eventDate || "Tanpa Tanggal"}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              
              return (
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Lokasi & Waktu Kegiatan</Label>
                  <div className="h-12 bg-gray-50 text-gray-500 border border-gray-100 rounded-xl px-4 flex items-center gap-2 text-sm italic">
                    <MapPin className="h-4 w-4" />
                    {editingReg.locationName} - {editingReg.locationDate} (Data Terkunci)
                  </div>
                  <p className="text-[10px] text-[#80766E] italic">*Lokasi tidak dapat diubah karena merupakan data historis (sebelum seed terakhir).</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingReg(null)} className="h-12 rounded-xl border-none bg-[#F8F7F4]">Batal</Button>
            <Button onClick={handleSaveReg} className="h-12 rounded-xl bg-primary text-white font-bold">Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
