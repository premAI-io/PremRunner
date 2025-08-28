import { useState } from "react";
import ChatPage from "./components/ChatPage";
import ModelsPage from "./components/ModelsPage";
import TracesPage from "./components/TracesPage";

type Page = "chat" | "models" | "traces";

// Prem icon as a React component
const PremIcon = ({ className }: { className?: string }) => (
  <svg
    width="29"
    height="32"
    viewBox="0 0 29 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M13.3285 19.8884L14.3947 20.0736L15.0696 19.1893L14.6862 18.1198L13.6105 17.9413L12.9419 18.8439L13.3285 19.8868V19.8884Z" fill="currentColor" />
    <path d="M17.9466 17.7611L17.5727 16.765L16.5651 16.5765L15.9361 17.4207L16.2847 18.4235L17.3097 18.6053L17.9466 17.7628V17.7611Z" fill="currentColor" />
    <path d="M17.8293 13.8785L16.8471 13.6933L16.2134 14.5109L16.5888 15.4986L17.5584 15.6388L18.1747 14.8379L17.8309 13.8802L17.8293 13.8785Z" fill="currentColor" />
    <path d="M16.0566 12.9658L15.6621 11.923L14.5959 11.7378L13.9273 12.6405L14.3123 13.6916L15.3801 13.8685L16.0566 12.9675V12.9658Z" fill="currentColor" />
    <path d="M12.9197 12.9241L11.9026 12.7439L11.2483 13.5949L11.6285 14.6093L12.6409 14.7545L13.2587 13.9269L12.9197 12.9258V12.9241Z" fill="currentColor" />
    <path d="M11.2578 15.6705L10.6415 16.4814L11.0075 17.4691L11.977 17.6093L12.5917 16.8167L12.2511 15.824L11.2562 15.6721L11.2578 15.6705Z" fill="currentColor" />
    <path d="M8.32847 13.0476L7.93557 14.2272L8.71345 15.1616L9.87788 14.9313L10.2708 13.7434L9.4929 12.8157L8.32847 13.0459V13.0476Z" fill="currentColor" />
    <path d="M10.1392 17.5208L9.39781 16.6098L8.26981 16.8251L7.89117 17.9663L8.64686 18.8706L9.75902 18.6487L10.1377 17.5225L10.1392 17.5208Z" fill="currentColor" />
    <path d="M11.863 21.3817L12.2274 20.2855L11.5065 19.3962L10.4451 19.6415L10.0601 20.721L10.7952 21.5869L11.8646 21.3801L11.863 21.3817Z" fill="currentColor" />
    <path d="M15.0917 22.86L15.4339 21.8255L14.7495 20.9913L13.7166 21.1899L13.3744 22.2243L14.0509 23.0903L15.0917 22.86Z" fill="currentColor" />
    <path d="M18.1049 21.2816L18.4329 20.2939L17.7707 19.4813L16.7963 19.6732L16.4399 20.6759L17.1084 21.5035L18.1049 21.2816Z" fill="currentColor" />
    <path d="M19.1363 17.0687L18.7434 18.2483L19.5149 19.1977L20.6635 18.9674L21.0786 17.7961L20.3071 16.8384L19.1363 17.0687Z" fill="currentColor" />
    <path d="M20.3736 13.131L19.2393 13.3463L18.8607 14.4725L19.5958 15.4002L20.7301 15.1849L21.1087 14.0353L20.3736 13.131Z" fill="currentColor" />
    <path d="M19.0936 11.0254L18.3807 10.1444L17.297 10.3513L16.9326 11.4475L17.6535 12.3285L18.7292 12.1216L19.092 11.0254H19.0936Z" fill="currentColor" />
    <path d="M13.9067 9.12498L13.5645 10.1661L14.2489 11.0087L15.2819 10.8102L15.6241 9.76068L14.9397 8.92643L13.9067 9.12498Z" fill="currentColor" />
    <path d="M10.6194 10.2212L10.2629 11.2239L10.9394 12.0198L11.928 11.8363L12.2559 10.8168L11.5874 10.0276L10.6194 10.2195V10.2212Z" fill="currentColor" />
    <path d="M18.81 9.00319L18.6721 7.64003L17.4792 7.08109L16.432 7.90866L16.5777 9.27182L17.7628 9.8074L18.81 9.00319Z" fill="currentColor" />
    <path d="M12.6551 6.66562L11.6507 7.45481L11.7885 8.74122L12.9371 9.2768L13.9257 8.48761L13.7879 7.18618L12.6536 6.66562H12.6551Z" fill="currentColor" />
    <path d="M7.74545 11.2323L8.82116 11.7295L9.78123 11.002L9.63548 9.754L8.55184 9.25679L7.60603 10.0076L7.74386 11.2339L7.74545 11.2323Z" fill="currentColor" />
    <path d="M7.73916 15.7506L7.62351 14.5793L6.59849 14.0971L5.68279 14.8012L5.82854 15.9808L6.84722 16.4396L7.74233 15.7506H7.73916Z" fill="currentColor" />
    <path d="M7.87695 21.2666L8.72771 20.6009L8.61205 19.4896L7.63773 19.0375L6.78698 19.7116L6.90263 20.8228L7.87695 21.2666Z" fill="currentColor" />
    <path d="M11.535 24.9122L12.56 24.0847L12.4222 22.7282L11.2292 22.1926L10.182 22.9968L10.3278 24.36L11.535 24.9122Z" fill="currentColor" />
    <path d="M16.3576 25.326L17.3462 24.5602L17.2083 23.2588L16.0803 22.7382L15.0696 23.504L15.2074 24.8138L16.356 25.3277L16.3576 25.326Z" fill="currentColor" />
    <path d="M21.2529 20.7677L20.1772 20.2622L19.2314 21.0047L19.3486 22.2377L20.4402 22.7432L21.3923 21.9924L21.2545 20.7661L21.2529 20.7677Z" fill="currentColor" />
    <path d="M22.4095 17.9029L23.3109 17.1905L23.1731 16.0192L22.1481 15.5604L21.2609 16.2645L21.3766 17.4357L22.4095 17.9029Z" fill="currentColor" />
    <path d="M22.213 12.2884L22.0974 11.1772L21.123 10.7334L20.2723 11.3991L20.3895 12.5103L21.3638 12.9625L22.2146 12.2884H22.213Z" fill="currentColor" />
    <path d="M24.7589 12.9392L23.4139 12.472L22.3524 13.4914L22.6645 14.9463L24.0096 15.4135L25.071 14.3941L24.7589 12.9392Z" fill="currentColor" />
    <path d="M19.7764 9.56213L21.0565 10.0059L22.0609 9.05657L21.7773 7.66171L20.4973 7.2179L19.4928 8.17561L19.7764 9.56213Z" fill="currentColor" />
    <path d="M14.344 5.73128L14.6133 7.04939L15.8284 7.47151L16.7742 6.56719L16.5049 5.24908L15.2898 4.82695L14.344 5.73128Z" fill="currentColor" />
    <path d="M9.97926 8.69617L10.8807 7.83857L10.6336 6.60555L9.4913 6.20678L8.58986 7.04937L8.82908 8.2974L9.97767 8.69617H9.97926Z" fill="currentColor" />
    <path d="M6.14541 13.116L6.98983 12.3035L6.75694 11.1389L5.68122 10.7718L4.83047 11.561L5.06336 12.7406L6.147 13.116H6.14541Z" fill="currentColor" />
    <path d="M4.23321 19.0609L5.57825 19.528L6.63971 18.5319L6.3482 17.0537L4.98732 16.5865L3.92586 17.5976L4.23162 19.0609H4.23321Z" fill="currentColor" />
    <path d="M9.22357 22.4379L7.93557 21.9941L6.93906 22.9585L7.21472 24.3533L8.50273 24.7754L9.49924 23.8261L9.22357 22.4396V22.4379Z" fill="currentColor" />
    <path d="M14.6481 26.2687L14.401 24.9439L13.1858 24.5452L12.2258 25.4261L12.4951 26.7509L13.7102 27.1714L14.6481 26.2671V26.2687Z" fill="currentColor" />
    <path d="M19.0207 23.3038L18.1193 24.1614L18.3807 25.4095L19.5293 25.7849L20.4101 24.9506L20.1693 23.7026L19.0207 23.3038Z" fill="currentColor" />
    <path d="M23.3188 21.2282L24.1632 20.4307L23.9303 19.2661L22.8546 18.8907L22.0038 19.6882L22.2431 20.8528L23.3188 21.2282Z" fill="currentColor" />
    <path d="M22.7517 21.9857L21.7631 23.2721L22.3239 24.8188L23.8733 25.0791L24.8698 23.7927L24.309 22.246L22.7533 21.9857H22.7517Z" fill="currentColor" />
    <path d="M27.2906 16.8317L26.7519 15.3768L25.2897 15.1399L24.3518 16.3429L24.8968 17.8212L26.359 18.0514L27.2906 16.8334V16.8317Z" fill="currentColor" />
    <path d="M22.6708 9.34021L23.1794 10.7184L24.5545 10.9403L25.4417 9.80739L24.9331 8.43589L23.5517 8.19062L22.6708 9.34021Z" fill="currentColor" />
    <path d="M18.9542 6.10667L19.7764 5.02716L19.3043 3.74075L18.01 3.51884L17.1878 4.59836L17.6599 5.89311L18.9542 6.10834V6.10667Z" fill="currentColor" />
    <path d="M12.0372 5.65451L12.8008 4.64341L12.3651 3.45544L11.1643 3.24855L10.3864 4.25131L10.8221 5.44595L12.0372 5.65284V5.65451Z" fill="currentColor" />
    <path d="M6.24837 10.0143L7.23695 8.74291L6.67612 7.17953L5.12671 6.93426L4.13813 8.20565L4.69896 9.76903L6.24837 10.0143Z" fill="currentColor" />
    <path d="M1.70154 15.1683L2.24019 16.6232L3.70247 16.8601L4.64036 15.6571L4.11596 14.1939L2.63943 13.9419L1.70154 15.1683Z" fill="currentColor" />
    <path d="M6.32123 22.6531L5.81902 21.2816L4.44388 21.0514L3.57095 22.201L4.0589 23.5791L5.4483 23.801L6.32123 22.6514V22.6531Z" fill="currentColor" />
    <path d="M10.0442 25.9017L9.22201 26.9662L9.68779 28.2609L10.9821 28.4761L11.8044 27.3966L11.3323 26.1252L10.0442 25.9033V25.9017Z" fill="currentColor" />
    <path d="M16.9612 26.3455L16.1976 27.3566L16.6348 28.5446L17.85 28.7514L18.6136 27.7403L18.1763 26.5524L16.9612 26.3455Z" fill="currentColor" />
    <path d="M13.6089 28.8048L12.7439 30.3982L13.6089 32H15.3611L16.2483 30.3982L15.3611 28.8048H13.6089Z" fill="currentColor" />
    <path d="M21.733 26.1236L20.9108 27.6252L21.733 29.1269H23.3775L24.1997 27.6252L23.3775 26.1236H21.733Z" fill="currentColor" />
    <path d="M28.2285 19.1443H26.687L25.9233 20.5458L26.687 21.9557H28.2285L29 20.5458L28.2285 19.1443Z" fill="currentColor" />
    <path d="M28.1698 12.7556L28.897 11.4459L28.1698 10.1361H26.7519L26.0247 11.4459L26.7519 12.7556H28.1698Z" fill="currentColor" />
    <path d="M23.2174 5.58611L23.8859 4.36811L23.2174 3.17347H21.9008L21.2323 4.36811L21.9008 5.58611H23.2174Z" fill="currentColor" />
    <path d="M15.3912 3.19516L16.2562 1.59341L15.3912 0H13.639L12.766 1.59341L13.639 3.19516H15.3912Z" fill="currentColor" />
    <path d="M7.25908 5.87642L8.08131 4.37478L7.25908 2.87314H5.62253L4.79396 4.37478L5.62253 5.87642H7.25908Z" fill="currentColor" />
    <path d="M2.30511 12.8557L3.07665 11.4458L2.30511 10.0443H0.771538L0 11.4458L0.771538 12.8557H2.30669H2.30511Z" fill="currentColor" />
    <path d="M0.828516 19.236L0.101337 20.5458L0.828516 21.8639H2.26069L2.97361 20.5458L2.26069 19.236H0.828516Z" fill="currentColor" />
    <path d="M5.77473 26.4139L5.10617 27.6236L5.77473 28.8416H7.09918L7.76774 27.6236L7.09918 26.4139H5.77473Z" fill="currentColor" />
  </svg>
);

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("chat");

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0 bg-stone-50 border-r border-stone-200 flex flex-col">
        <div className="h-[73px] border-b border-stone-200 bg-stone-50 flex items-center px-6">
          <div className="flex items-center gap-3">
            <PremIcon className="w-8 h-9 text-stone-950" />
            <div>
              <h1 className="text-lg font-semibold text-stone-950">PremRunner</h1>
              <p className="text-xs text-stone-500">Model Runner</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          <div className="space-y-1">
            <button
              onClick={() => setCurrentPage("chat")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 ${
                currentPage === "chat"
                  ? "bg-white shadow-md border-stone-200 text-stone-950"
                  : "text-stone-600 hover:bg-stone-50 border-transparent"
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  currentPage === "chat" ? "text-stone-950" : "text-stone-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span className="text-sm font-medium">Chat</span>
            </button>

            <button
              onClick={() => setCurrentPage("models")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 ${
                currentPage === "models"
                  ? "bg-white shadow-md border-stone-200 text-stone-950"
                  : "text-stone-600 hover:bg-stone-50 border-transparent"
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  currentPage === "models" ? "text-stone-950" : "text-stone-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <span className="text-sm font-medium">Finetuned Models</span>
            </button>

            <button
              onClick={() => setCurrentPage("traces")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 ${
                currentPage === "traces"
                  ? "bg-white shadow-md border-stone-200 text-stone-950"
                  : "text-stone-600 hover:bg-stone-50 border-transparent"
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  currentPage === "traces" ? "text-stone-950" : "text-stone-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-sm font-medium">Traces</span>
            </button>
          </div>
        </nav>

        <div className="h-[88px] border-t border-stone-200 bg-stone-50 flex items-center px-6">
          <div className="w-full text-xs text-stone-500">
            <div className="flex items-center justify-between mb-1">
              <span>Version</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">Running</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentPage === "chat" ? (
          <ChatPage />
        ) : currentPage === "models" ? (
          <ModelsPage />
        ) : (
          <TracesPage />
        )}
      </div>
    </div>
  );
}