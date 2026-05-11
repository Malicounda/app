import { useAuth } from "@/contexts/AuthContext";
import ReforestationNationalReports from "./ReforestationNationalReports";
import ReforestationRegionalReports from "./ReforestationRegionalReports";
import ReforestationDepartementReports from "./ReforestationDepartementReports";

export default function ReforestationReports() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return <ReforestationNationalReports />;
  }

  if (user?.role === "agent") {
    return <ReforestationRegionalReports />;
  }

  return <ReforestationDepartementReports />;
}
