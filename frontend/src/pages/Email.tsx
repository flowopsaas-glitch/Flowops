export default function Email() {
  const data = localStorage.getItem("companyInfo");
  const company = data ? JSON.parse(data) : null;

  if (!company || company.status !== "APPROVED") {
    return (
      <div className="mt-20 text-center">
        <h1 className="text-xl font-bold">🔒 Email Locked</h1>
        <p className="text-gray-500 mt-2">
          Complete company setup and await approval.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-20 text-center">
      <h1 className="text-2xl font-bold">📧 Email Center</h1>
      <p>Email features enabled.</p>
    </div>
  );
}
