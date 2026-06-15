import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email, nama, lokasi, tanggal } = await request.json();

    const data = await resend.emails.send({
      from: 'Donor Darah <admin@dondarkci.com>', // Ganti dengan domain terverifikasi di dashboard Resend
      to: [email],
      subject: 'Donor Darah PT Kereta Commuter Indonesia',
      html: `
        <p>Halo ${nama},</p>
        <p>Terimakasih, anda telah terdaftar sebagai peserta Donor Darah PT Kereta Commuter Indonesia di ${lokasi} pada tanggal ${tanggal}. </p>
        <p>Setetes darah yang anda berikan bukan sekadar cairan tubuh, melainkan harapan baru, senyuman baru, dan kesempatan hidup kedua bagi seseorang yang membutuhkan<p>


        <p>Salam hangat,<p>
        <p>PT Kereta Commuter Indonesia<p>
      `,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
