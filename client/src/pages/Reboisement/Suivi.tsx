import { ArrowLeft, Calendar } from 'lucide-react';
import { useLocation } from 'wouter';

export default function ReboisementSuivi() {
  const [, setLocation] = useLocation();
  return (
    <div className="w-full bg-transparent">

      <div className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-gray-700">
          Calendrier et tableaux à venir...
        </div>
      </div>
    </div>
  );
}
