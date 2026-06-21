"""
Fix the Driver PINs section position in UsersRoles.tsx.
It was inserted after the closing </div> instead of inside it.
"""
import pathlib

p = pathlib.Path('/home/kakes/FlowOps-Logistics/frontend/src/pages/UsersRoles.tsx')
c = p.read_text()

MARKER_START = '{/* DRIVER PINs */'
MARKER_END = '        </div>\n        </div>'  # end of driver pins section

# Find where the pins section starts
pins_start = c.find(MARKER_START)
if pins_start == -1:
    print('ERROR: Driver PINs section not found in file')
    exit(1)

# Find where the closing of the modal section is
# The modal ends with: '      )}\n'
# Then comes '    </div>\n  );\n}' or similar
# We need to find what comes right before pins_start and check if
# the pins section is outside the main div

lines = c.splitlines(keepends=True)

# Find the line number of pins_start
pins_line = c[:pins_start].count('\n')
print(f'Driver PINs starts at line {pins_line + 1}')

# Find the line number of the return closing
# Look for the pattern:  );  followed by just }
close_idx = -1
for i in range(len(lines) - 1, pins_line, -1):
    stripped = lines[i].strip()
    if stripped == '}' and i > 0 and lines[i-1].strip() in (')', ');'):
        close_idx = i
        print(f'Return closes at line {i + 1}: {repr(lines[i])}')
        break

if close_idx == -1:
    # Try alternative: find '  );\n}' after pins_start
    idx = c.find('\n  );\n}', pins_start)
    if idx != -1:
        print(f'Found return close after pins section at char {idx}')
        # The pins section is outside - extract it and re-insert before the wrapper closing div
        
        # Extract the entire pins section
        section_end_marker = '        }\n      )}'
        section_end = c.find(section_end_marker, pins_start)
        if section_end != -1:
            section_end += len(section_end_marker)
            pins_section = c[pins_start - 8 : section_end + 1]  # include leading whitespace
            
            # Remove pins section from current position
            c_without = c[:pins_start - 8].rstrip() + '\n' + c[section_end + 1:].lstrip('\n')
            
            # Find the correct insertion point: right before the last </div> in the return
            # Look for the pattern that closes the main content div
            # Usually: \n      </div>\n    </div>\n  );\n}
            for pattern in ['\n      </div>\n    </div>\n  );\n}',
                           '\n    </div>\n  );\n}',
                           '\n  </div>\n  );\n}']:
                insert_idx = c_without.rfind(pattern)
                if insert_idx != -1:
                    nl = '\n'
                    new_c = c_without[:insert_idx] + nl + '        ' + pins_section.strip() + nl + c_without[insert_idx:]
                    p.write_text(new_c)
                    print(f'Fixed: re-inserted Driver PINs inside wrapper (pattern: {repr(pattern[:20])})')
                    exit(0)
            
            print('Could not find insertion pattern - saving without change')
        else:
            print('Could not find end of pins section')
    else:
        print('File structure looks correct - no fix needed')
    exit(0)

print('File appears correct already')
