
export function isPermitActive(permit: any) {
  const now = new Date();
  const expiryDate = new Date(permit.expiryDate);
  
  return permit.status === 'active' && expiryDate >= now;
}

export function isPermitExpired(permit: any) {
  const now = new Date();
  const expiryDate = new Date(permit.expiryDate);
  
  return permit.status === 'expired' || (permit.status === 'active' && expiryDate < now);
}

export function isPermitSuspended(permit: any) {
  return permit.status === 'suspended';
}

export function getPermitStatus(permit: any) {
  if (isPermitSuspended(permit)) {
    return "Suspendu";
  } else if (isPermitExpired(permit)) {
    return "Expiré";
  } else {
    return "Actif";
  }
}

async function getNextPermitSequence() {
  try {
    const response = await fetch('/api/permits');
    const permits = await response.json();
    const maxId = permits.length > 0 
      ? Math.max(...permits.map((p: any) => {
          const num = p.permitNumber.split('-').pop();
          return parseInt(num) || 0;
        }))
      : 0;
    return maxId + 1;
  } catch (error) {
    console.error('Erreur lors de la récupération de la séquence:', error);
    return 1;
  }
}

export async function generatePermitNumber() {
  const year = new Date().getFullYear();
  const sequence = await getNextPermitSequence();
  return `P-${year}-${sequence.toString().padStart(4, '0')}`;
}

export function getPermitTypeByNumber(permitNumber: string) {
  if (permitNumber.startsWith('P-')) {
    return 'standard';
  } else if (permitNumber.startsWith('PI-')) {
    return 'international';
  } else {
    return 'unknown';
  }
}

export function calculateRenewalPrice(permit: any) {
  return Number(permit.price);
}
