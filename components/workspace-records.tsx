"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";

export type RecordColumn<T> = { key: string; label: string; render: (row: T) => ReactNode; value?: (row: T) => string | number; primary?: boolean };

/** A single record-browser interaction across operational and creator modules. */
export function WorkspaceRecords<T>({ rows, columns, rowKey, searchText, noun = "records", searchPlaceholder = "Search records", actions, empty, initialSort, externalSearch = "", searchable = true }: {
  rows: T[]; columns: RecordColumn<T>[]; rowKey: (row:T)=>string|number;
  searchText: (row:T)=>string; noun?:string; searchPlaceholder?:string;
  actions?:ReactNode; empty?:ReactNode; initialSort?:string; externalSearch?:string; searchable?:boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort || "");
  const [descending, setDescending] = useState(Boolean(initialSort));
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const filtered = useMemo(() => {
    const terms = `${externalSearch} ${query}`.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const result = rows.filter(row => terms.every(term => searchText(row).toLocaleLowerCase().includes(term)));
    const column = columns.find(item => item.key === sort);
    if (column?.value) result.sort((a,b) => {
      const left=column.value!(a), right=column.value!(b);
      const comparison=typeof left === "number" && typeof right === "number" ? left-right : String(left).localeCompare(String(right),undefined,{numeric:true});
      return descending ? -comparison : comparison;
    });
    return result;
  }, [rows, columns, sort, descending, externalSearch, query, searchText]);
  const lastPage=Math.max(0,Math.ceil(filtered.length/size)-1);
  const current=Math.min(page,lastPage);
  const visible=filtered.slice(current*size,current*size+size);
  return <div className="workspace-records">
    <div className="records-toolbar">{searchable ? <label className="records-search"><Search size={16}/><input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label> : null}{actions}<span className="records-count" role="status">{filtered.length} {noun}</span></div>
    {visible.length ? <div className="records-scroll"><table><thead><tr>{columns.map(column=><th key={column.key} scope="col" aria-sort={sort===column.key?(descending?"descending":"ascending"):undefined}>{column.value?<button onClick={()=>{setDescending(sort===column.key?!descending:false);setSort(column.key);setPage(0);}}>{column.label}{sort===column.key?(descending?<ArrowDown size={12}/>:<ArrowUp size={12}/>):null}</button>:column.label}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={rowKey(row)}>{columns.map(column=><td key={column.key} data-label={column.label} data-primary={column.primary||undefined}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>:<div className="records-empty">{query||externalSearch?<><strong>No matching {noun}</strong><p>Try another search or clear your filters.</p>{query ? <button className="btn-outline" onClick={()=>{setQuery("");setPage(0);}}>Clear search</button> : null}</>:empty||<><strong>No {noun} yet</strong><p>Records will appear here when they become available.</p></>}</div>}
    <footer className="records-pagination"><span>{filtered.length?`${current*size+1}-${Math.min((current+1)*size,filtered.length)} of ${filtered.length}`:`0 ${noun}`}</span><label>Rows <select aria-label="Rows per page" value={size} onChange={event=>{setSize(Number(event.target.value));setPage(0);}}>{[10,25,50].map(value=><option key={value}>{value}</option>)}</select></label><button aria-label="Previous page" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></button><button aria-label="Next page" disabled={current>=lastPage} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></button></footer>
  </div>;
}
